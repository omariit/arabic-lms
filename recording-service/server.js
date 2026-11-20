import http from "node:http";
import fs from "node:fs/promises";
import { createReadStream, existsSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  chunkFileName,
  cleanupPlan,
  clampPercent,
  describeChunks,
  diskPressure,
  signToken,
  verifyToken,
} from "./lib.js";
import { fileSize, processSession } from "./pipeline.js";

/**
 * recording-service — chunked lesson recording ingestion + FFmpeg pipeline.
 *
 * Runs in its own Railway service with a volume mounted at /data/recordings so the
 * main app process never touches FFmpeg, never buffers video in memory, and can
 * scale to zero independently. State lives on disk (state.json per session), so a
 * redeploy or a restart never loses a lesson that is already uploaded.
 */

const CONFIG = {
  port: Number(process.env.PORT ?? 3000),
  dataDir: process.env.DATA_DIR ?? "/data/recordings",
  secret: process.env.RECORDING_SHARED_SECRET ?? "",
  chunkMaxAgeHours: Number(process.env.CHUNK_MAX_AGE_HOURS ?? 24),
  tempMaxAgeHours: Number(process.env.TEMP_MAX_AGE_HOURS ?? 12),
  staleSessionMaxAgeHours: Number(process.env.STALE_SESSION_MAX_AGE_HOURS ?? 24),
  retentionDays: process.env.FINAL_VIDEO_RETENTION_DAYS ? Number(process.env.FINAL_VIDEO_RETENTION_DAYS) : null,
  highWater: Number(process.env.DISK_HIGH_WATER_MARK ?? 80),
  criticalWater: Number(process.env.DISK_CRITICAL_MARK ?? 90),
  maxChunkBytes: Number(process.env.MAX_CHUNK_BYTES ?? 32 * 1024 * 1024),
  maxSessionBytes: Number(process.env.MAX_SESSION_BYTES ?? 4 * 1024 * 1024 * 1024),
  callbackUrl: process.env.CORE_BE_CALLBACK_URL ?? "",
  callbackSecret: process.env.RECORDING_CALLBACK_SECRET ?? process.env.RECORDING_SHARED_SECRET ?? "",
  version: process.env.SERVICE_VERSION ?? "1.0.0",
  cleanupIntervalMs: Number(process.env.CLEANUP_INTERVAL_MS ?? 15 * 60 * 1000),
  maxViewSeconds: 6 * 60 * 60,
};

const SESSIONS = path.join(CONFIG.dataDir, "sessions");
const OUTPUTS = path.join(CONFIG.dataDir, "outputs");
const jobs = new Map(); // sessionId → promise
const startedAt = Date.now();

const log = (...args) => console.log(new Date().toISOString(), ...args);

// ───────────────────────────── state helpers ─────────────────────────────
const sessionDirOf = (id) => path.join(SESSIONS, id);
const chunksDirOf = (id) => path.join(sessionDirOf(id), "chunks");
const outputDirOf = (id) => path.join(OUTPUTS, id);
const STATE_FILE = (dir) => path.join(dir, "state.json");

const stateCache = new Map(); // id → last known state (survives a corrupted file)
const writeQueues = new Map(); // id → promise chain: one writer at a time

async function readState(id) {
  try {
    const raw = await fs.readFile(STATE_FILE(sessionDirOf(id)), "utf8");
    const parsed = JSON.parse(raw);
    stateCache.set(id, parsed);
    return parsed;
  } catch {
    // A half-written file (two concurrent progress updates) must not look like a
    // lost session: fall back to the last state we had in memory.
    return stateCache.get(id) ?? null;
  }
}

/**
 * Serialised, atomic state update. FFmpeg progress fires many updates per second;
 * writing them concurrently truncated the JSON and made a live session look
 * "unknown" to the API. One writer per session + tmp→rename fixes that.
 */
async function writeState(id, patch) {
  const previous = writeQueues.get(id) ?? Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(async () => {
      const dir = sessionDirOf(id);
      await fs.mkdir(dir, { recursive: true });
      const current = (await readState(id)) ?? stateCache.get(id) ?? { id, createdAt: Date.now() };
      const merged = { ...current, ...patch, id, updatedAt: Date.now() };
      const file = STATE_FILE(dir);
      const tmp = `${file}.tmp`;
      // Forensic breadcrumb: status/chunk updates are the ones we need to explain
      // when a session's history looks wrong after the fact.
      const trail = Array.isArray(merged.history) ? merged.history : [];
      if ("status" in patch || "chunkCount" in patch) {
        trail.push({
          at: Date.now(),
          status: merged.status,
          chunkCount: merged.chunkCount ?? 0,
          keys: Object.keys(patch).join(","),
        });
        merged.history = trail.slice(-40);
      }
      await fs.writeFile(tmp, JSON.stringify(merged, null, 2), "utf8");
      await fs.rename(tmp, file);
      stateCache.set(id, merged);
      return merged;
    });
  writeQueues.set(id, next);
  try {
    return await next;
  } finally {
    if (writeQueues.get(id) === next) writeQueues.delete(id);
  }
}

function publicState(state, extra = {}) {
  const diskCount = extra.chunkCount ?? 0;
  const diskBytes = extra.bytesReceived ?? 0;
  return {
    // `extra` used to be spread last, which let the on-disk counters (0 once the
    // raw chunks are deleted after processing) clobber the recorded totals.
    ...extra,
    sessionId: state.id,
    status: state.status,
    stage: state.stage,
    progress: clampPercent(state.progress ?? 0),
    title: state.title ?? null,
    lessonId: state.lessonId ?? null,
    courseId: state.courseId ?? null,
    chunkCount: Math.max(state.chunkCount ?? 0, diskCount),
    missingChunks: extra.missingChunks?.length ? extra.missingChunks : (state.missingChunks ?? []),
    bytesReceived: Math.max(state.bytesReceived ?? 0, diskBytes),
    durationSec: state.durationSec ?? null,
    sizeBytes: state.sizeBytes ?? null,
    hasVideo: Boolean(state.hasVideo),
    hasThumbnail: Boolean(state.hasThumbnail),
    error: state.error ?? null,
    startedAt: state.startedAt ?? null,
    finalizedAt: state.finalizedAt ?? null,
    readyAt: state.readyAt ?? null,
    updatedAt: state.updatedAt ?? null,
  };
}

// ───────────────────────────── auth ─────────────────────────────
function secretOk(req) {
  const provided = req.headers["x-recording-secret"];
  return Boolean(CONFIG.secret) && provided === CONFIG.secret;
}

function tokenFrom(req, url) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return url.searchParams.get("t") ?? "";
}

/** Chunk upload / finalize / playback: per-session scoped token. */
function sessionAccess(req, url, sessionId, kinds = ["upload", "view", "control"]) {
  if (secretOk(req)) return { via: "secret" };
  const payload = verifyToken(CONFIG.secret, tokenFrom(req, url));
  if (!payload) return null;
  if (payload.sid !== sessionId) return null;
  if (!kinds.includes(payload.kind)) return null;
  return { via: "token", ...payload };
}

// ───────────────────────────── http helpers ─────────────────────────────
function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(data),
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type, x-recording-secret, x-chunk-mime",
    "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
    "access-control-expose-headers": "content-range, content-length, accept-ranges",
  });
  res.end(data);
}

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const err = new Error("payload too large");
      err.status = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req, limit = 64 * 1024) {
  const buf = await readBody(req, limit);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString("utf8"));
  } catch {
    const err = new Error("invalid JSON body");
    err.status = 400;
    throw err;
  }
}

async function diskUsage() {
  try {
    const stat = await fs.statfs(CONFIG.dataDir);
    const total = stat.blocks * stat.bsize;
    const free = stat.bavail * stat.bsize;
    const used = total - free;
    return { totalBytes: total, usedBytes: used, usedPct: total ? (used / total) * 100 : 0, freeBytes: free };
  } catch {
    return { totalBytes: 0, usedBytes: 0, usedPct: 0, freeBytes: 0 };
  }
}

// ───────────────────────────── core callbacks ─────────────────────────────
async function notifyCore(state) {
  if (!CONFIG.callbackUrl) return;
  const payload = JSON.stringify({
    sessionId: state.id,
    status: state.status,
    stage: state.stage,
    progress: clampPercent(state.progress ?? 0),
    durationSec: state.durationSec ?? null,
    sizeBytes: state.sizeBytes ?? null,
    error: state.error ?? null,
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(CONFIG.callbackUrl, {
        method: "POST",
        headers: { "content-type": "application/json", "x-recording-secret": CONFIG.callbackSecret },
        body: payload,
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) return;
      log(`callback ${res.status} for ${state.id}`);
    } catch (e) {
      log(`callback attempt ${attempt + 1} failed for ${state.id}: ${e instanceof Error ? e.message : e}`);
    }
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
}

// ───────────────────────────── pipeline runner ─────────────────────────────
async function startProcessing(id, state) {
  if (jobs.has(id)) return jobs.get(id);
  const job = (async () => {
    const t0 = Date.now();
    try {
      await writeState(id, { status: "PROCESSING", stage: "starting", progress: 1, error: null });
      const result = await processSession({
        sessionDir: sessionDirOf(id),
        outputDir: outputDirOf(id),
        log,
        onStage: (stage, progress) => {
          void writeState(id, { status: "PROCESSING", stage, progress: clampPercent(progress) });
        },
        onProgress: (progress) => {
          void writeState(id, { status: "PROCESSING", progress: clampPercent(progress) });
        },
      });
      const ready = await writeState(id, {
        status: "READY",
        stage: "ready",
        progress: 100,
        durationSec: result.durationSec,
        sizeBytes: result.sizeBytes,
        hasVideo: true,
        hasThumbnail: existsSync(result.thumbnailFile),
        readyAt: Date.now(),
        processingMs: Date.now() - t0,
        error: null,
      });
      log(`session ${id} ready in ${Date.now() - t0}ms (${result.durationSec}s, ${result.sizeBytes}b)`);
      await notifyCore(ready);
      // Raw uploads are no longer needed once the final MP4 exists.
      await fs.rm(chunksDirOf(id), { recursive: true, force: true }).catch(() => {});
      await fs.rm(path.join(sessionDirOf(id), "temp"), { recursive: true, force: true }).catch(() => {});
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log(`session ${id} FAILED: ${message}`);
      const failed = await writeState(id, { status: "FAILED", stage: "failed", error: message.slice(0, 800) });
      await notifyCore(failed);
    } finally {
      jobs.delete(id);
    }
  })();
  jobs.set(id, job);
  return job;
}

// ───────────────────────────── cleanup ─────────────────────────────
async function removeSession(id, { keepOutput = false } = {}) {
  stateCache.delete(id);
  await fs.rm(sessionDirOf(id), { recursive: true, force: true }).catch(() => {});
  if (!keepOutput) await fs.rm(outputDirOf(id), { recursive: true, force: true }).catch(() => {});
}

async function runCleanup(reason = "interval") {
  const usage = await diskUsage();
  const pressure = diskPressure({ usedPct: usage.usedPct, highWaterMark: CONFIG.highWater, criticalMark: CONFIG.criticalWater });
  const plan = cleanupPlan(pressure);
  const now = Date.now();
  let removed = 0;
  const report = { reason, pressure, usedPct: Math.round(usage.usedPct), actions: {} };

  const sessionIds = await fs.readdir(SESSIONS).catch(() => []);
  for (const id of sessionIds) {
    const state = await readState(id);
    if (!state) {
      const stat = await fs.stat(sessionDirOf(id)).catch(() => null);
      if (stat && now - stat.mtimeMs > CONFIG.chunkMaxAgeHours * 3600_000) {
        await removeSession(id);
        removed++;
      }
      continue;
    }
    const ageHours = (now - (state.updatedAt ?? state.createdAt ?? now)) / 3600_000;

    if (plan.includes("expired-chunks") || pressure !== "ok") {
      const chunksDir = chunksDirOf(id);
      for (const name of await fs.readdir(chunksDir).catch(() => [])) {
        const file = path.join(chunksDir, name);
        const stat = await fs.stat(file).catch(() => null);
        if (stat && now - stat.mtimeMs > CONFIG.chunkMaxAgeHours * 3600_000) {
          await fs.rm(file, { force: true });
          removed++;
        }
      }
    }
    if (plan.includes("expired-temp") || pressure !== "ok") {
      const tempDir = path.join(sessionDirOf(id), "temp");
      for (const name of await fs.readdir(tempDir).catch(() => [])) {
        const file = path.join(tempDir, name);
        const stat = await fs.stat(file).catch(() => null);
        if (stat && now - stat.mtimeMs > CONFIG.tempMaxAgeHours * 3600_000) {
          await fs.rm(file, { force: true });
          removed++;
        }
      }
    }
    if (
      plan.includes("stale-sessions") &&
      state.status !== "READY" &&
      !jobs.has(id) &&
      ageHours > CONFIG.staleSessionMaxAgeHours
    ) {
      await writeState(id, { status: "ABORTED", stage: "stale", error: "تخلّت الجلسة عن نفسها — نُظّفت تلقائيًا" });
      await removeSession(id);
      report.actions.staleSessions = (report.actions.staleSessions ?? 0) + 1;
      removed++;
    }
  }

  if (CONFIG.retentionDays && plan.includes("old-outputs")) {
    for (const id of await fs.readdir(OUTPUTS).catch(() => [])) {
      const stat = await fs.stat(outputDirOf(id)).catch(() => null);
      if (stat && now - stat.mtimeMs > CONFIG.retentionDays * 86_400_000) {
        await fs.rm(outputDirOf(id), { recursive: true, force: true }).catch(() => {});
        await writeState(id, { status: "EXPIRED", hasVideo: false, error: "انتهت مدة الاحتفاظ بالفيديو" }).catch(() => {});
        removed++;
      }
    }
  }

  report.removed = removed;
  report.actions = { ...report.actions, plan };
  if (removed || pressure !== "ok") log("cleanup", JSON.stringify(report));
  return report;
}

// ───────────────────────────── streaming ─────────────────────────────
function streamFile(req, res, file, contentType) {
  let stat;
  try {
    stat = statSync(file);
  } catch {
    return json(res, 404, { error: "not found" });
  }
  const range = req.headers.range;
  const headers = {
    "content-type": contentType,
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=300",
    "access-control-allow-origin": "*",
  };
  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    if (match) {
      let start = match[1] ? Number(match[1]) : 0;
      let end = match[2] ? Number(match[2]) : stat.size - 1;
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= stat.size) {
        res.writeHead(416, { "content-range": `bytes */${stat.size}` });
        return res.end();
      }
      end = Math.min(end, stat.size - 1);
      res.writeHead(206, {
        ...headers,
        "content-range": `bytes ${start}-${end}/${stat.size}`,
        "content-length": end - start + 1,
      });
      return createReadStream(file, { start, end }).pipe(res);
    }
  }
  res.writeHead(200, { ...headers, "content-length": stat.size });
  return createReadStream(file).pipe(res);
}

// ───────────────────────────── routes ─────────────────────────────
const routes = [
  ["GET", /^\/$/, async (_req, res) => json(res, 200, {
    service: "recording-service",
    version: CONFIG.version,
    status: "ok",
    docs: "/health, POST /sessions, PUT /sessions/:id/chunks/:index, POST /sessions/:id/finalize, GET /sessions/:id, GET /sessions/:id/video.mp4, GET /sessions/:id/thumbnail.jpg",
  })],

  ["GET", /^\/health$/, async (_req, res) => {
    const disk = await diskUsage();
    const pressure = diskPressure({ usedPct: disk.usedPct, highWaterMark: CONFIG.highWater, criticalMark: CONFIG.criticalWater });
    const sessionIds = await fs.readdir(SESSIONS).catch(() => []);
    const outputIds = await fs.readdir(OUTPUTS).catch(() => []);
    json(res, 200, {
      ok: pressure !== "critical",
      version: CONFIG.version,
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      host: os.hostname(),
      secretConfigured: Boolean(CONFIG.secret),
      callbackConfigured: Boolean(CONFIG.callbackUrl),
      disk: { ...disk, pressure, highWater: CONFIG.highWater, criticalWater: CONFIG.criticalWater },
      sessions: { stored: sessionIds.length, outputs: outputIds.length, activeJobs: jobs.size },
      limits: { maxChunkBytes: CONFIG.maxChunkBytes, maxSessionBytes: CONFIG.maxSessionBytes, retentionDays: CONFIG.retentionDays },
    });
  }],

  // create a session (called by the app server, authenticated by the shared secret)
  ["POST", /^\/sessions$/, async (req, res) => {
    if (!secretOk(req)) return json(res, 401, { error: "unauthorized" });
    const body = await readJson(req);
    const id = String(body.sessionId ?? randomUUID());
    if (!/^[A-Za-z0-9_-]{6,64}$/.test(id)) return json(res, 400, { error: "invalid sessionId" });
    const existing = await readState(id);
    if (existing) return json(res, 200, { sessionId: id, created: false, state: publicState(existing) });

    await fs.mkdir(chunksDirOf(id), { recursive: true });
    await fs.mkdir(outputDirOf(id), { recursive: true });
    const state = await writeState(id, {
      id,
      status: "RECORDING",
      stage: "created",
      progress: 0,
      title: body.title ?? null,
      lessonId: body.lessonId ?? null,
      courseId: body.courseId ?? null,
      teacherId: body.teacherId ?? null,
      chunkCount: 0,
      bytesReceived: 0,
      bytesReceived: 0,
      startedAt: Date.now(),
    });
    log(`session ${id} created`);
    return json(res, 201, {
      sessionId: id,
      state: publicState(state),
      uploadToken: signToken(CONFIG.secret, { sid: id, kind: "upload", uid: body.teacherId ?? null }, 12 * 3600),
      viewToken: signToken(CONFIG.secret, { sid: id, kind: "view" }, CONFIG.maxViewSeconds),
    });
  }],

  // list (debug / admin tooling)
  ["GET", /^\/sessions$/, async (req, res) => {
    if (!secretOk(req)) return json(res, 401, { error: "unauthorized" });
    const ids = await fs.readdir(SESSIONS).catch(() => []);
    const states = [];
    for (const id of ids) {
      const state = await readState(id);
      if (state) states.push(publicState(state));
    }
    states.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
    json(res, 200, { sessions: states, activeJobs: jobs.size });
  }],

  // session health/status
  ["GET", /^\/sessions\/([A-Za-z0-9_-]{6,64})$/, async (req, res, id) => {
    if (!sessionAccess(req, new URL(req.url, "http://x"), id)) return json(res, 401, { error: "unauthorized" });
    const state = await readState(id);
    if (!state) return json(res, 404, { error: "unknown session" });
    const chunks = await fs.readdir(chunksDirOf(id)).catch(() => []);
    const described = describeChunks(chunks);
    const bytes = (await Promise.all(chunks.map((n) => fileSize(path.join(chunksDirOf(id), n))))).reduce((a, b) => a + b, 0);
    const url = new URL(req.url, "http://x");
    return json(res, 200, {
      state: publicState(state, {
        chunkCount: described.count,
        missingChunks: described.missing,
        bytesReceived: bytes,
        processing: jobs.has(id),
      }),
      // Append `?debug=1` (with the shared secret) to see how the session evolved.
      ...(url.searchParams.get("debug") && secretOk(req)
        ? { trail: state.history ?? [], raw: { chunkCount: state.chunkCount, bytesReceived: state.bytesReceived } }
        : {}),
      disk: await diskUsage(),
    });
  }],

  // upload one chunk (idempotent; PUT same index twice is safe)
  ["PUT", /^\/sessions\/([A-Za-z0-9_-]{6,64})\/chunks\/(\d{1,7})$/, async (req, res, id, indexRaw) => {
    if (!sessionAccess(req, new URL(req.url, "http://x"), id, ["upload", "control"])) {
      return json(res, 401, { error: "unauthorized" });
    }
    const state = await readState(id);
    if (!state) return json(res, 404, { error: "unknown session" });
    if (!["RECORDING", "UPLOADING"].includes(state.status)) {
      return json(res, 409, { error: `session is ${state.status}` });
    }
    const index = Number(indexRaw);
    const body = await readBody(req, CONFIG.maxChunkBytes);

    const usage = await diskUsage();
    const pressure = diskPressure({ usedPct: usage.usedPct, highWaterMark: CONFIG.highWater, criticalMark: CONFIG.criticalWater });
    if (pressure === "critical") {
      await runCleanup("disk-critical");
      const after = await diskUsage();
      if (diskPressure({ usedPct: after.usedPct, highWaterMark: CONFIG.highWater, criticalMark: CONFIG.criticalWater }) === "critical") {
        return json(res, 507, { error: "disk full — try again later" });
      }
    }
    if ((state.bytesReceived ?? 0) + body.length > CONFIG.maxSessionBytes) {
      return json(res, 413, { error: "session size limit reached" });
    }

    const dir = chunksDirOf(id);
    await fs.mkdir(dir, { recursive: true });
    const target = path.join(dir, chunkFileName(index));
    const tmp = `${target}.tmp`;
    await fs.writeFile(tmp, body);
    await fs.rename(tmp, target);

    const names = (await fs.readdir(dir)).filter((n) => /^chunk-\d{6}\.bin$/.test(n));
    const described = describeChunks(names);
    const bytes = (await Promise.all(names.map((n) => fileSize(path.join(dir, n))))).reduce((a, b) => a + b, 0);
    const updated = await writeState(id, {
      status: "UPLOADING",
      stage: "receiving",
      chunkCount: described.count,
      missingChunks: described.missing,
      bytesReceived: bytes,
    });

    return json(res, 200, {
      ok: true,
      index,
      bytes: body.length,
      state: publicState(updated, { chunkCount: described.count, missingChunks: described.missing, bytesReceived: bytes }),
    });
  }],

  // finish the upload and start FFmpeg
  ["POST", /^\/sessions\/([A-Za-z0-9_-]{6,64})\/finalize$/, async (req, res, id) => {
    if (!sessionAccess(req, new URL(req.url, "http://x"), id, ["upload", "control"])) {
      return json(res, 401, { error: "unauthorized" });
    }
    const state = await readState(id);
    if (!state) return json(res, 404, { error: "unknown session" });
    if (state.status === "READY") return json(res, 200, { state: publicState(state) });
    if (["PROCESSING", "UPLOADING"].includes(state.status) && jobs.has(id)) {
      return json(res, 202, { state: publicState(state) });
    }
    const chunkNames = await fs.readdir(chunksDirOf(id)).catch(() => []);
    const described = describeChunks(chunkNames);
    if (!described.count) return json(res, 400, { error: "لا توجد مقاطع مرفوعة" });
    if (described.missing.length) {
      return json(res, 409, { error: "بعض المقاطع مفقودة", missingChunks: described.missing.slice(0, 50) });
    }

    const pending = await writeState(id, { status: "PROCESSING", stage: "queued", progress: 1, finalizedAt: Date.now() });
    void startProcessing(id, pending);
    return json(res, 202, { state: publicState(pending) });
  }],

  ["POST", /^\/sessions\/([A-Za-z0-9_-]{6,64})\/abort$/, async (req, res, id) => {
    if (!sessionAccess(req, new URL(req.url, "http://x"), id, ["upload", "control"])) {
      return json(res, 401, { error: "unauthorized" });
    }
    const state = await readState(id);
    if (!state) return json(res, 404, { error: "unknown session" });
    const aborted = await writeState(id, { status: "ABORTED", stage: "aborted", error: "أُلغيت الجلسة" });
    await fs.rm(chunksDirOf(id), { recursive: true, force: true }).catch(() => {});
    await fs.rm(path.join(sessionDirOf(id), "temp"), { recursive: true, force: true }).catch(() => {});
    await notifyCore(aborted);
    return json(res, 200, { state: publicState(aborted) });
  }],

  ["DELETE", /^\/sessions\/([A-Za-z0-9_-]{6,64})$/, async (req, res, id) => {
    if (!secretOk(req)) return json(res, 401, { error: "unauthorized" });
    await removeSession(id);
    log(`session ${id} deleted`);
    return json(res, 200, { ok: true });
  }],

  ["POST", /^\/tokens\/([A-Za-z0-9_-]{6,64})$/, async (req, res, id) => {
    if (!secretOk(req)) return json(res, 401, { error: "unauthorized" });
    const body = await readJson(req);
    const kind = body.kind === "view" ? "view" : "upload";
    return json(res, 200, { token: signToken(CONFIG.secret, { sid: id, kind }, Number(body.ttl ?? 3600)) });
  }],

  ["GET", /^\/sessions\/([A-Za-z0-9_-]{6,64})\/video\.mp4$/, async (req, res, id) => {
    if (!sessionAccess(req, new URL(req.url, "http://x"), id, ["view", "control"])) {
      return json(res, 401, { error: "unauthorized" });
    }
    return streamFile(req, res, path.join(outputDirOf(id), "final.mp4"), "video/mp4");
  }],

  ["GET", /^\/sessions\/([A-Za-z0-9_-]{6,64})\/thumbnail\.jpg$/, async (req, res, id) => {
    if (!sessionAccess(req, new URL(req.url, "http://x"), id, ["view", "control"])) {
      return json(res, 401, { error: "unauthorized" });
    }
    return streamFile(req, res, path.join(outputDirOf(id), "thumbnail.jpg"), "image/jpeg");
  }],
];

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type, x-recording-secret, x-chunk-mime, range",
      "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
    });
    return res.end();
  }
  const url = new URL(req.url ?? "/", "http://internal");
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  for (const [method, pattern, handler] of routes) {
    if (req.method !== method) continue;
    const match = pattern.exec(pathname);
    if (!match) continue;
    try {
      return await handler(req, res, ...match.slice(1));
    } catch (e) {
      const status = e && typeof e === "object" && "status" in e ? e.status : 500;
      log(`${method} ${pathname} failed: ${e instanceof Error ? e.message : e}`);
      return json(res, status || 500, { error: e instanceof Error ? e.message : "internal error" });
    }
  }
  return json(res, 404, { error: "not found" });
});

server.requestTimeout = 0; // long chunk uploads on slow mobile networks
server.headersTimeout = 65_000;

async function boot() {
  if (!CONFIG.secret) {
    log("FATAL: RECORDING_SHARED_SECRET is required");
    process.exit(1);
  }
  await fs.mkdir(SESSIONS, { recursive: true });
  await fs.mkdir(OUTPUTS, { recursive: true });
  const usage = await diskUsage();
  log(`data dir ${CONFIG.dataDir} — disk ${Math.round(usage.usedPct)}% used of ${(usage.totalBytes / 1e9).toFixed(1)}GB`);
  server.listen(CONFIG.port, "0.0.0.0", () => log(`recording-service listening on :${CONFIG.port}`));
  setTimeout(() => void runCleanup("boot"), 5000);
  setInterval(() => void runCleanup("interval"), CONFIG.cleanupIntervalMs).unref();
}

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    log(`${signal} received — closing server`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 8000).unref();
  });
}

boot().catch((e) => {
  log("boot failed", e);
  process.exit(1);
});
