import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { r2Configured, newAudioKey, presignPut } from "@/lib/r2";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const ALLOWED_MIME = new Set(["audio/webm", "audio/mp4", "audio/aac", "audio/ogg", "audio/mpeg"]);

/**
 * Presigned PUT for direct browser -> Cloudflare R2 upload of a recorded audio file.
 * Keeps Railway RAM/bandwidth free: the file never transits the app server.
 */
export async function POST(req: Request) {
  const { user, error } = await apiUser("any");
  if (error) return error;

  const rl = rateLimit(`presign:${user.id}`, 20, 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  if (!r2Configured()) {
    return NextResponse.json({ error: "تخزين الصوت غير مهيأ (R2)" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as { kind?: string; mimeType?: string };
  const kind = body.kind === "feedback" ? "feedback" : "submission";
  const mimeType = body.mimeType || "audio/webm";
  const baseMime = mimeType.split(";")[0];
  if (!ALLOWED_MIME.has(baseMime)) {
    return NextResponse.json({ error: "صيغة صوت غير مسموحة" }, { status: 400 });
  }

  const key = newAudioKey(kind, user.id);
  const contentType = baseMime === "audio/aac" ? "audio/mp4" : baseMime;
  const uploadUrl = await presignPut(key, contentType, 300);
  return NextResponse.json({ uploadUrl, key, contentType, expiresIn: 300 });
}
