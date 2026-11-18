import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
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
