import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const BUCKET = process.env.R2_BUCKET_NAME || "";

function client() {
  if (!ACCOUNT_ID || !BUCKET) throw new Error("R2 is not configured");
  return new S3Client({
    region: "auto",
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
    },
  });
}

export function r2Configured(): boolean {
  return Boolean(ACCOUNT_ID && BUCKET && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY);
}

/** New private-bucket object key for student/teacher audio. */
export function newAudioKey(kind: "submission" | "feedback", userId: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${kind}/${date}/${userId}/${randomUUID()}`;
}

/** Upload categories — every one of them is browser → R2 direct (the app only ever sees the key). */
export type UploadKind = "submission" | "feedback" | "lesson" | "receipt" | "cover" | "resource" | "livefile";

export const UPLOAD_KINDS: Record<
  UploadKind,
  { staffOnly: boolean; mimes: string[]; maxBytes: number }
> = {
  submission: { staffOnly: false, mimes: ["audio/webm", "audio/mp4", "audio/aac", "audio/ogg", "audio/mpeg"], maxBytes: 20 * 1024 * 1024 },
  feedback: { staffOnly: true, mimes: ["audio/webm", "audio/mp4", "audio/aac", "audio/ogg", "audio/mpeg"], maxBytes: 20 * 1024 * 1024 },
  lesson: { staffOnly: true, mimes: ["audio/webm", "audio/mp4", "audio/aac", "audio/ogg", "audio/mpeg"], maxBytes: 40 * 1024 * 1024 },
  receipt: { staffOnly: false, mimes: ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"], maxBytes: 8 * 1024 * 1024 },
  // Course cover artwork (Udemy-style hero image) — teacher only.
  cover: { staffOnly: true, mimes: ["image/jpeg", "image/png", "image/webp"], maxBytes: 5 * 1024 * 1024 },
  // Material shared inside a live room (image/PDF/audio) — staff and students.
  livefile: {
    staffOnly: false,
    mimes: ["image/jpeg", "image/png", "image/webp", "application/pdf", "audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg"],
    maxBytes: 25 * 1024 * 1024,
  },
  // Downloadable lesson material: PDF, images, or an audio recitation file — teacher only.
  resource: {
    staffOnly: true,
    mimes: ["application/pdf", "image/jpeg", "image/png", "image/webp", "audio/mpeg", "audio/mp4", "audio/webm", "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    maxBytes: 40 * 1024 * 1024,
  },
};

/** Key prefix owned by `ownerId`, used both when minting and when validating a returned key. */
export function keyPrefix(kind: UploadKind, ownerId: string): string {
  return `${kind}/${new Date().toISOString().slice(0, 10)}/${ownerId}/`;
}

/** A key is only accepted if it sits inside the namespace we minted for that owner. */
export function keyBelongsTo(key: string, kind: UploadKind, ownerId: string): boolean {
  return key.startsWith(keyPrefix(kind, ownerId)) && !key.includes("..");
}

/** Metadata check without downloading the object (used instead of proxying bytes). */
export async function headObject(key: string): Promise<{ size: number; contentType: string } | null> {
  if (!r2Configured()) return null;
  try {
    const out = await client().send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return { size: Number(out.ContentLength ?? 0), contentType: out.ContentType ?? "" };
  } catch {
    return null;
  }
}

/** Validate an uploaded object: it must exist, be within the kind's limits, and match its MIME family. */
export async function verifyUpload(
  key: string | null | undefined,
  kind: UploadKind,
  ownerId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!key) return { ok: true };
  if (!keyBelongsTo(key, kind, ownerId)) return { ok: false, error: "مفتاح الملف غير صالح" };
  const meta = await headObject(key);
  if (!meta) return { ok: false, error: "الملف غير موجود في التخزين" };
  const rule = UPLOAD_KINDS[kind];
  if (meta.size <= 0) return { ok: false, error: "الملف فارغ" };
  if (meta.size > rule.maxBytes) return { ok: false, error: "حجم الملف أكبر من المسموح" };
  if (meta.contentType && !rule.mimes.includes(meta.contentType.split(";")[0])) {
    return { ok: false, error: "نوع الملف غير مسموح" };
  }
  return { ok: true };
}

/** Short-lived presigned PUT so the browser uploads straight to R2 (zero Railway bandwidth). */
export async function presignPut(key: string, contentType: string, ttlSeconds = 300) {
  const cmd = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType });
  return getSignedUrl(client(), cmd, { expiresIn: ttlSeconds });
}

/** Short-lived presigned GET for playback-only access. */
export async function presignGet(key: string, ttlSeconds = 600) {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(client(), cmd, { expiresIn: ttlSeconds });
}
