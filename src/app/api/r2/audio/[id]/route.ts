import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { r2Configured, presignGet } from "@/lib/r2";

/**
 * Presigned GET for a private R2 audio object.
 * Students may only stream their own submission; the teacher (ADMIN) may stream
 * any. URL expires in 10 minutes.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await apiUser("any");
  if (error) return error;

  const { id } = await params;
  const submission = await db.audioSubmission.findUnique({ where: { id } });
  if (!submission) return NextResponse.json({ error: "الملف غير موجود" }, { status: 404 });

  // Staff (teacher/admin/assistant) may play any submission; a student only her own.
  const isStaff = user.role !== "STUDENT";
  const attempt = await db.examAttempt.findUnique({ where: { id: submission.attemptId } });
  const isOwner = submission.userId === user.id;
  const isFeedback = attempt?.feedbackAudioKey === submission.audioKey;
  if (!isStaff && !isOwner && !isFeedback) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  if (!r2Configured()) return NextResponse.json({ error: "التخزين غير مهيأ" }, { status: 503 });

  const url = await presignGet(submission.audioKey, 600);
  return NextResponse.json({ url, expiresIn: 600, mimeType: submission.mimeType });
}
