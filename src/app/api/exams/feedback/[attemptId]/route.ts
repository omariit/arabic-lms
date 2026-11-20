import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { r2Configured, presignGet } from "@/lib/r2";

/** Student: read the teacher's correction — grade, written note and voice feedback. */
export async function GET(_req: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const { user, error } = await apiUser("STUDENT");
  if (error) return error;

  const { attemptId } = await params;
  const attempt = await db.examAttempt.findUnique({
    where: { id: attemptId },
    include: { exam: { select: { title: true, maxGrade: true, type: true } } },
  });
  if (!attempt) return NextResponse.json({ error: "غير موجود" }, { status: 404 });
  if (attempt.userId !== user.id) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });

  const audioUrl =
    attempt.feedbackAudioKey && r2Configured()
      ? await presignGet(attempt.feedbackAudioKey, 600)
      : null;

  return NextResponse.json({
    status: attempt.status,
    grade: attempt.manualGrade ?? attempt.autoScore ?? null,
    maxGrade: attempt.exam.maxGrade,
    examTitle: attempt.exam.title,
    examType: attempt.exam.type,
    feedbackText: attempt.feedbackText || null,
    audioUrl,
  });
}
