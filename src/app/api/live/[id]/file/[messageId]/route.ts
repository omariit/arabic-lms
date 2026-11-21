import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { presignGet, r2Configured } from "@/lib/r2";

/** Presigned download for a file shared in the meeting chat (participants only). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  const { id, messageId } = await params;
  const url = new URL(req.url);
  const invite = url.searchParams.get("invite") ?? "";

  const message = await db.liveMessage.findUnique({
    where: { id: messageId },
    include: { liveSession: { select: { id: true, courseId: true, inviteToken: true, guestAllowed: true } } },
  });
  if (!message || message.liveSessionId !== id || !message.fileKey) {
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

  const signed = await presignGet(message.fileKey, 600);
  // <img src> cannot read JSON, so inline requests are redirected to the signed URL
  // (the R2 domain stays out of the app's own HTML for everything else).
  if (url.searchParams.get("inline") === "1") return NextResponse.redirect(signed, 307);
  return NextResponse.json({ url: signed, mimeType: message.fileMime || "application/octet-stream", name: message.fileName ?? "ملف" });
}
