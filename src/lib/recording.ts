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

async function call<T>(path: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<T> {
  if (!recordingConfigured()) {
    throw new RecordingServiceError("خدمة التسجيل غير مفعّلة — أضيفي RECORDING_SERVICE_URL و RECORDING_SHARED_SECRET", 503);
  }
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
    throw new RecordingServiceError("خدمة التسجيل لا تستجيب حاليًا — حاولي بعد لحظات", 503);
  }
  const text = await res.text();
  const data = text ? (JSON.parse(text) as T & { error?: string }) : ({} as T & { error?: string });
  if (!res.ok) {
    throw new RecordingServiceError((data as { error?: string }).error ?? `خطأ من خدمة التسجيل (${res.status})`, res.status);
  }
  return data as T;
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
  call<{ sessionId: string; state: RemoteState; uploadToken: string; viewToken: string }>("/sessions", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const fetchRemoteState = (sessionId: string, timeoutMs = 8000) =>
  call<{ state: RemoteState; disk?: { usedPct: number } }>(`/sessions/${sessionId}`, {}, timeoutMs);

export const finalizeRemote = (sessionId: string) =>
  call<{ state: RemoteState }>(`/sessions/${sessionId}/finalize`, { method: "POST", body: "{}" });

export const abortRemote = (sessionId: string) =>
  call<{ state: RemoteState }>(`/sessions/${sessionId}/abort`, { method: "POST", body: "{}" });

export const deleteRemote = (sessionId: string) =>
  call<{ ok: boolean }>(`/sessions/${sessionId}`, { method: "DELETE" });

export const mintTokens = (sessionId: string, ttlSeconds = 6 * 3600) =>
  call<{ token: string }>(`/tokens/${sessionId}`, {
    method: "POST",
    body: JSON.stringify({ kind: "view", ttl: ttlSeconds }),
  });

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
