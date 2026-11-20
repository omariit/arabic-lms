import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { presignGet, r2Configured } from "@/lib/r2";

/** Presigned playback for a voice note posted in the meeting chat (participants only). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  const { id, messageId } = await params;
  const url = new URL(req.url);
  const invite = url.searchParams.get("invite") ?? "";

  const message = await db.liveMessage.findUnique({
    where: { id: messageId },
    include: { liveSession: { select: { id: true, courseId: true, inviteToken: true, guestAllowed: true } } },
  });
  if (!message || message.liveSessionId !== id || !message.audioKey) {
    return NextResponse.json({ error: "غير موجود" }, { status: 404 });
  }

  const user = await getCurrentUser();
  let allowed = false;
  if (user) {
    if (user.role !== "STUDENT") allowed = true;
    else {
      const enrolled = await db.enrollment.findFirst({
        where: { userId: user.id, courseId: message.liveSession.courseId, status: "ACTIVE" },
        select: { id: true },
      });
      allowed = Boolean(enrolled);
    }
  }
  if (!allowed && message.liveSession.guestAllowed && invite && invite === message.liveSession.inviteToken) {
    allowed = true;
  }
  if (!allowed) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  if (!r2Configured()) return NextResponse.json({ error: "التخزين غير مهيأ" }, { status: 503 });

  const signed = await presignGet(message.audioKey, 600);
  return NextResponse.json({ url: signed, mimeType: message.audioMime || "audio/webm" });
}
