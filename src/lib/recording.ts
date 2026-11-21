import "server-only";
import { db } from "@/lib/db";
import type { RecordingSession, RecordingStatus } from "@prisma/client";

/**
 * Client for the separate `recording-service` Railway service.
 *
 * The app never handles video bytes: the browser streams chunks straight to the
 * service, and this module only exchanges JSON control messages (create session,
 * finalize, read health) authenticated with a shared secret. Playback is proxied
 * through an app route so students never learn the service URL or its token.
 */

const SERVICE_URL = (process.env.RECORDING_SERVICE_URL ?? "").replace(/\/+$/, "");
const SHARED_SECRET = process.env.RECORDING_SHARED_SECRET ?? "";
export const RECORDING_CHUNK_MAX_MB = Number(process.env.RECORDING_CHUNK_MAX_MB ?? 32);

export function recordingConfigured() {
  return Boolean(SERVICE_URL && SHARED_SECRET);
}

export class RecordingServiceError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

type CallOptions = {
  timeoutMs?: number;
  /** Extra attempts for cold starts: Railway scales this service to zero when idle. */
  retries?: number;
  /** Backoff before each retry (ms). */
  retryDelayMs?: number;
};

const COLD_START_ERROR = "خدمة التسجيل تستيقظ الآن — أعيدي المحاولة بعد ثوانٍ";

function isColdStartStatus(status: number) {
  return status === 502 || status === 503 || status === 504;
}

/**
 * JSON call to the recording service.
 *
 * The service is deployed with Railway's "app sleeping" (scale to zero), so the
 * first request after an idle period can take 10–30s while the container starts,
 * and may answer with 502/503 from the edge meanwhile. Those are not real errors:
 * we retry with backoff instead of failing the teacher's recording.
 */
async function call<T>(path: string, init: RequestInit = {}, options: CallOptions | number = {}): Promise<T> {
  const opts: CallOptions = typeof options === "number" ? { timeoutMs: options } : options;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const retries = opts.retries ?? 0;
  const retryDelayMs = opts.retryDelayMs ?? 1200;

  if (!recordingConfigured()) {
    throw new RecordingServiceError("خدمة التسجيل غير مفعّلة — أضيفي RECORDING_SERVICE_URL و RECORDING_SHARED_SECRET", 503);
  }

  let lastError: RecordingServiceError | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${SERVICE_URL}${path}`, {
        ...init,
        headers: {
          "content-type": "application/json",
          "x-recording-secret": SHARED_SECRET,
          ...(init.headers ?? {}),
        },
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
    } catch {
      lastError = new RecordingServiceError(COLD_START_ERROR, 503);
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, retryDelayMs * (attempt + 1)));
        continue;
      }
      throw lastError;
    }

    const text = await res.text();
    let data: (T & { error?: string }) | Record<string, never> = {};
    try {
      data = text ? (JSON.parse(text) as T & { error?: string }) : {};
    } catch {
      data = {};
    }

    if (!res.ok) {
      // A scale-to-zero cold start surfaces as a 5xx from the edge, not as an
      // application error — give it time instead of blaming the teacher.
      if (isColdStartStatus(res.status) && attempt < retries) {
        await new Promise((r) => setTimeout(r, retryDelayMs * (attempt + 1)));
        continue;
      }
      const message =
        isColdStartStatus(res.status) && !(data as { error?: string }).error
          ? COLD_START_ERROR
          : ((data as { error?: string }).error ?? `خطأ من خدمة التسجيل (${res.status})`);
      throw new RecordingServiceError(message, res.status);
    }
    return data as T;
  }
  throw lastError ?? new RecordingServiceError(COLD_START_ERROR, 503);
}

/**
 * Wake the service and wait until it answers. Call this before creating a
 * session so the teacher never sees a failure that is only a sleeping container.
 */
export async function warmRecordingService(budgetMs = 75_000): Promise<{ awake: boolean; ms: number }> {
  if (!recordingConfigured()) {
    throw new RecordingServiceError("خدمة التسجيل غير مفعّلة — أضيفي RECORDING_SERVICE_URL و RECORDING_SHARED_SECRET", 503);
  }
  const started = Date.now();
  let attempt = 0;
  while (Date.now() - started < budgetMs) {
    attempt += 1;
    try {
      const res = await fetch(`${SERVICE_URL}/health`, { signal: AbortSignal.timeout(12_000), cache: "no-store" });
      if (res.ok) return { awake: true, ms: Date.now() - started };
    } catch {
      /* still starting */
    }
    await new Promise((r) => setTimeout(r, Math.min(4000, 700 * attempt)));
  }
  throw new RecordingServiceError(
    "خدمة التسجيل لم تستيقظ بعد — انتظري قليلًا ثم أعيدي المحاولة (التسجيل لم يبدأ، ولم يُفقد شيء)",
    503,
  );
}

export type RemoteState = {
  sessionId: string;
  status: RecordingStatus;
  stage: string;
  progress: number;
  chunkCount: number;
  missingChunks: number[];
  bytesReceived: number;
  durationSec: number | null;
  sizeBytes: number | null;
  hasVideo: boolean;
  hasThumbnail: boolean;
  error: string | null;
  updatedAt: number | null;
};

export const createRemoteSession = (body: { sessionId: string; title: string; lessonId?: string | null; courseId?: string | null; teacherId: string }) =>
  call<{ sessionId: string; state: RemoteState; uploadToken: string; viewToken: string }>(
    "/sessions",
    { method: "POST", body: JSON.stringify(body) },
    { timeoutMs: 25_000, retries: 2, retryDelayMs: 1500 },
  );

export const fetchRemoteState = (sessionId: string, timeoutMs = 12_000) =>
  call<{ state: RemoteState; disk?: { usedPct: number } }>(`/sessions/${sessionId}`, {}, { timeoutMs, retries: 1 });

export const finalizeRemote = (sessionId: string) =>
  // Cold start + reading hours of chunks: give it real time, and retry a 5xx edge
  // error once (finalize is idempotent on the service side).
  call<{ state: RemoteState }>(`/sessions/${sessionId}/finalize`, { method: "POST", body: "{}" }, { timeoutMs: 90_000, retries: 1, retryDelayMs: 2500 });

export const abortRemote = (sessionId: string) =>
  call<{ state: RemoteState }>(`/sessions/${sessionId}/abort`, { method: "POST", body: "{}" }, { timeoutMs: 20_000, retries: 1 });

export const deleteRemote = (sessionId: string) =>
  call<{ ok: boolean }>(`/sessions/${sessionId}`, { method: "DELETE" }, { timeoutMs: 25_000, retries: 1 });

export const mintTokens = (sessionId: string, ttlSeconds = 6 * 3600) =>
  call<{ token: string }>(
    `/tokens/${sessionId}`,
    { method: "POST", body: JSON.stringify({ kind: "view", ttl: ttlSeconds }) },
    { timeoutMs: 20_000, retries: 1 },
  );

export function callbackAuthorized(headers: Headers) {
  const provided = headers.get("x-recording-secret") ?? "";
  return Boolean(SHARED_SECRET) && provided === SHARED_SECRET;
}

/** Copy whatever the service knows into our row (status/health/links). */
export async function syncRecording(row: RecordingSession, remote: RemoteState): Promise<RecordingSession> {
  const next: Partial<RecordingSession> = {
    status: remote.status,
    stage: remote.stage,
    progress: remote.progress,
    chunkCount: remote.chunkCount,
    bytesReceived: remote.bytesReceived ?? 0,
    durationSec: remote.durationSec ?? row.durationSec,
    sizeBytes: remote.sizeBytes ?? row.sizeBytes,
    hasVideo: Boolean(remote.hasVideo),
    errorMessage: remote.error ?? null,
  };
  if (remote.status === "READY" && !row.readyAt) next.readyAt = new Date();
  if (remote.status === "PROCESSING" && !row.finalizedAt) next.finalizedAt = new Date();

  const changed = Object.entries(next).some(([key, value]) => {
    const current = row[key as keyof RecordingSession];
    return value instanceof Date ? Number(current) !== Number(value) : current !== value;
  });
  if (!changed) return row;
  return db.recordingSession.update({ where: { id: row.id }, data: next });
}

export const ACTIVE_STATUSES: RecordingStatus[] = ["RECORDING", "UPLOADING", "PROCESSING"];
export const okStatus = (status: RecordingStatus) => status === "READY";

/** Public-safe view of a row (no service ids or teacher data leakage). */
export function recordingView(row: RecordingSession) {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    stage: row.stage,
    progress: row.progress,
    chunkCount: row.chunkCount,
    durationSec: row.durationSec,
    sizeBytes: row.sizeBytes,
    hasVideo: row.hasVideo,
    error: row.errorMessage,
    lessonId: row.lessonId,
    courseId: row.courseId,
    startedAt: row.startedAt,
    readyAt: row.readyAt,
    updatedAt: row.updatedAt,
    videoUrl: row.hasVideo ? `/api/recordings/${row.id}/video` : null,
    thumbnailUrl: row.hasVideo ? `/api/recordings/${row.id}/thumbnail` : null,
  };
}
