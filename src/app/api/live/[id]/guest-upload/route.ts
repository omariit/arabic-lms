import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { clientMeta } from "@/lib/auth";
import { presignPut, r2Configured, UPLOAD_KINDS } from "@/lib/r2";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

/**
 * Upload permission for an invited guest inside a live room.
 *
 * A guest has no account, so the normal presign endpoint cannot authorise her.
 * Here the invite token is the credential: it must match the session, the session
 * must still allow guests, and the upload is rate limited per address. The key is
 * scoped to the session id, so a guest can never write into someone's namespace.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ip } = await clientMeta();

  const rl = rateLimit(`live-guest-upload:${ip}`, 12, 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  if (!r2Configured()) return NextResponse.json({ error: "تخزين الملفات غير مهيأ" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { invite?: string; mimeType?: string };
  const session = await db.liveSession.findUnique({
    where: { id },
    select: { id: true, guestAllowed: true, inviteToken: true, status: true },
  });
  if (!session || !session.guestAllowed || !session.inviteToken) {
    return NextResponse.json({ error: "المشاركة بالملفات غير متاحة" }, { status: 403 });
  }
  if (body.invite !== session.inviteToken) {
    return NextResponse.json({ error: "رابط الدعوة غير صالح" }, { status: 403 });
  }
  if (session.status !== "LIVE") {
    return NextResponse.json({ error: "الحصة لم تبدأ أو انتهت" }, { status: 409 });
  }

  const rule = UPLOAD_KINDS.livefile;
  const mimeType = (body.mimeType || "").split(";")[0];
  if (!rule.mimes.includes(mimeType)) {
    return NextResponse.json({ error: "هذه الصيغة غير مسموحة — صور أو PDF أو صوت" }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const key = `livefile/${today}/${session.id}/${randomUUID()}`;
  const uploadUrl = await presignPut(key, mimeType, 300);
  return NextResponse.json({ uploadUrl, key, mimeType });
}
