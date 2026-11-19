import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { r2Configured, presignGet } from "@/lib/r2";

/**
 * Presigned GET for a voice note attached to a lesson-thread message.
 * The owner student, any staff member, sees it. URL expires in 10 min.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ messageId: string }> }) {
  const { user, error } = await apiUser("any");
  if (error) return error;
  const { messageId } = await params;

  const message = await db.lessonMessage.findUnique({
    where: { id: messageId },
    include: { thread: { select: { studentId: true } } },
  });
  if (!message || !message.audioKey) return NextResponse.json({ error: "غير موجود" }, { status: 404 });

  const isOwner = message.thread.studentId === user.id;
  const isStaff = user.role !== "STUDENT";
  if (!isOwner && !isStaff) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  if (!r2Configured()) return NextResponse.json({ error: "التخزين غير مهيأ" }, { status: 503 });

  const url = await presignGet(message.audioKey, 600);
  return NextResponse.json({ url, expiresIn: 600, mimeType: message.audioMime || "audio/webm" });
}
