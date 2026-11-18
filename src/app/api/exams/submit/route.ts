import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

/** Submit MCQ answers: auto-grading happens here with correctIndex never exposed. */
export async function POST(req: Request) {
  const { user, error } = await apiUser("STUDENT");
  if (error) return error;

  const rl = rateLimit(`examsubmit:${user.id}`, 10, 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  const { attemptId, answers } = (await req.json().catch(() => ({}))) as {
    attemptId?: string;
    answers?: Record<string, number>;
  };
  if (!attemptId || !answers) return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });

  const attempt = await db.examAttempt.findUnique({
    where: { id: attemptId },
    include: { exam: { include: { questions: true } } },
  });
  if (!attempt) return NextResponse.json({ error: "المحاولة غير موجودة" }, { status: 404 });
  if (attempt.userId !== user.id) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  if (attempt.status !== "IN_PROGRESS") return NextResponse.json({ error: "تم الإرسال مسبقًا" }, { status: 409 });

  // Auto-grade on the server.
  let correct = 0;
  for (const q of attempt.exam.questions) {
    if (answers[q.id] === q.correctIndex) correct++;
  }
  const total = Math.max(1, attempt.exam.questions.length);
  const autoScore = Math.round((correct / total) * attempt.exam.maxGrade);

  const updated = await db.examAttempt.update({
    where: { id: attemptId },
    data: {
      status: "SUBMITTED",
      answers: answers as object,
      autoScore,
      submittedAt: new Date(),
    },
  });

  // Per-question review (with correctness) returned only after submission.
  const review = attempt.exam.questions.map((q) => ({
    id: q.id,
    text: q.text,
    options: q.options as string[],
    correctIndex: q.correctIndex,
    selected: answers[q.id] ?? null,
  }));

  return NextResponse.json({ attempt: updated, score: autoScore, maxGrade: attempt.exam.maxGrade, review });
}
