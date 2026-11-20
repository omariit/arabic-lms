import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Pure helpers shared by the server and its tests: token signing/verification,
 * chunk framing rules and disk guards. No I/O here on purpose.
 */

// ───────────────────────────── tokens ─────────────────────────────
/**
 * Short-lived token format: base64url(json).hmac — identical in spirit to the
 * app's session tokens so both sides can be reasoned about the same way.
 * kinds: "upload" (browser → chunks) | "view" (browser → video/thumbnail).
 */
export function signToken(secret, payload, ttlSeconds = 3600) {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const encoded = Buffer.from(JSON.stringify(body)).toString("base64url");
  const sig = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifyToken(secret, token, expectedKind) {
  if (typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const encoded = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(encoded).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const body = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (typeof body.exp !== "number" || body.exp < Math.floor(Date.now() / 1000)) return null;
    if (expectedKind && body.kind && body.kind !== expectedKind) return null;
    return body;
  } catch {
    return null;
  }
}

// ───────────────────────── chunk framing ─────────────────────────
export const CHUNK_NAME = /^chunk-(\d{6})\.bin$/;

export function chunkFileName(index) {
  return `chunk-${String(index).padStart(6, "0")}.bin`;
}

/** Numeric, gap-aware listing of uploaded chunks (gaps = lost uploads). */
export function describeChunks(names) {
  const indexes = names
    .map((n) => CHUNK_NAME.exec(n))
    .filter(Boolean)
    .map((m) => Number(m[1]))
    .sort((x, y) => x - y);
  const missing = [];
  if (indexes.length) {
    for (let i = indexes[0]; i <= indexes[indexes.length - 1]; i++) {
      if (!indexes.includes(i)) missing.push(i);
    }
  }
  return { count: indexes.length, first: indexes[0] ?? null, last: indexes.at(-1) ?? null, missing };
}

/** MediaRecorder chunks are one continuous stream: bytes must be joined in order. */
export function looksLikeStandaloneMp4(head) {
  // ftyp box starts at byte 4 of every self-contained MP4
  return Buffer.isBuffer(head) && head.length >= 8 && head.subarray(4, 8).toString("latin1") === "ftyp";
}

export function looksLikeWebm(head) {
  return Buffer.isBuffer(head) && head.length >= 4 && head.readUInt32BE(0) === 0x1a45dfa3;
}

// ───────────────────────── disk guards ─────────────────────────
export function diskPressure({ usedPct, highWaterMark, criticalMark }) {
  if (usedPct >= criticalMark) return "critical";
  if (usedPct >= highWaterMark) return "high";
  return "ok";
}

/** Order in which cleanup should happen when space is tight. */
export function cleanupPlan(pressure) {
  if (pressure === "critical") return ["temp", "chunks", "aborted-sessions", "old-outputs"];
  if (pressure === "high") return ["temp", "aborted-sessions"];
  return ["stale-sessions", "expired-temp", "expired-chunks"];
}

/** Parse `-progress pipe:1` output ("out_time_ms=1234567") into seconds. */
export function progressSeconds(text) {
  const match = /out_time_ms=(\d+)/.exec(text) ?? /out_time_us=(\d+)/.exec(text);
  return match ? Number(match[1]) / 1_000_000 : null;
}

export function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
