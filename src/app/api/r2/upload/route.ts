import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { r2Configured, presignPut, UPLOAD_KINDS, keyPrefix, type UploadKind } from "@/lib/r2";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

/**
 * The single entry point for every file upload in the app.
 *
 * It returns a short-lived presigned PUT URL, so the browser sends the bytes
 * straight to Cloudflare R2 — nothing ever transits this server. The caller then
 * posts the returned `key` to the feature endpoint, which re-validates ownership
 * with a cheap HEAD request (see `verifyUpload`).
 */
export async function POST(req: Request) {
  const { user, error } = await apiUser("any");
  if (error) return error;

  const rl = rateLimit(`presign:${user.id}`, 30, 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  if (!r2Configured()) {
    return NextResponse.json({ error: "تخزين الملفات غير مهيأ (R2)" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    kind?: string; mimeType?: string; forUser?: string; ext?: string;
  };

  const kind = (body.kind ?? "submission") as UploadKind;
  const rule = UPLOAD_KINDS[kind];
  if (!rule) return NextResponse.json({ error: "نوع الرفع غير معروف" }, { status: 400 });

  const isStaff = user.role !== "STUDENT";
  if (rule.staffOnly && !isStaff) {
    return NextResponse.json({ error: "غير مصرح بهذا النوع من الرفع" }, { status: 403 });
  }

  const mimeType = (body.mimeType || rule.mimes[0]).split(";")[0];
  if (!rule.mimes.includes(mimeType)) {
    return NextResponse.json({ error: "صيغة ملف غير مسموحة" }, { status: 400 });
  }
  // Browsers report audio/aac but store it as an mp4 container.
  const contentType = mimeType === "audio/aac" ? "audio/mp4" : mimeType;

  // Voice feedback is addressed to a student, so the key lives in her namespace.
  let ownerId = user.id;
  if (kind === "feedback" && body.forUser) {
    const target = await db.user.findUnique({ where: { id: body.forUser }, select: { id: true, role: true } });
    if (!target) return NextResponse.json({ error: "الطالبة غير موجودة" }, { status: 404 });
    ownerId = target.id;
  }

  const key = `${keyPrefix(kind, ownerId)}${randomUUID()}`;
  const uploadUrl = await presignPut(key, contentType, 300);

  return NextResponse.json({
    uploadUrl,
    key,
    contentType,
    maxBytes: rule.maxBytes,
    expiresIn: 300,
  });
}
