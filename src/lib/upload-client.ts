"use client";

/** Upload categories understood by `POST /api/r2/upload`. */
export type UploadKind = "submission" | "feedback" | "lesson" | "receipt" | "cover" | "resource";

export type UploadResult = { key: string; mimeType: string; size: number };

export class UploadError extends Error {}

/**
 * Upload a blob straight from the browser to Cloudflare R2.
 *
 * 1. asks our API for a 5-minute presigned PUT (server stays metadata-only);
 * 2. PUTs the bytes to R2 (zero traffic through the app server);
 * 3. returns the object key, which the caller posts to the feature endpoint.
 *
 * The executing endpoint validates the key's namespace with a HEAD request, so a
 * tampered key never becomes a stored reference.
 */
export async function uploadToR2(
  blob: Blob,
  opts: { kind: UploadKind; mimeType?: string; forUser?: string; filename?: string },
): Promise<UploadResult> {
  const mimeType = (opts.mimeType || blob.type || "").split(";")[0];

  const presignRes = await fetch("/api/r2/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: opts.kind, mimeType, forUser: opts.forUser, ext: opts.filename?.split(".").pop() }),
  });
  const presign = (await presignRes.json().catch(() => ({}))) as {
    uploadUrl?: string; key?: string; contentType?: string; maxBytes?: number; error?: string;
  };
  if (!presignRes.ok || !presign.uploadUrl || !presign.key) {
    throw new UploadError(presign.error ?? "تعذّر تجهيز الرفع");
  }
  if (presign.maxBytes && blob.size > presign.maxBytes) {
    throw new UploadError(`حجم الملف أكبر من المسموح (${Math.round(presign.maxBytes / 1048576)} ميجا)`);
  }

  let put: Response;
  try {
    put = await fetch(presign.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": presign.contentType ?? mimeType },
      body: blob,
    });
  } catch {
    // Browser blocked the cross-origin PUT: storage CORS does not allow this
    // origin, or the network dropped. Never surface a bare "Failed to fetch".
    throw new UploadError("تعذّر الوصول إلى التخزين — تحقّقي من الاتصال ثم أعيدي المحاولة");
  }
  if (!put.ok) throw new UploadError(`فشل رفع الملف إلى التخزين (${put.status})`);

  return { key: presign.key, mimeType: presign.contentType ?? mimeType, size: blob.size };
}
