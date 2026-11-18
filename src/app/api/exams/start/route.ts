import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

/** Start (or resume) an exam attempt after enrollment verification. */
export async function POST(req: Request) {
  const { user, error } = await apiUser("STUDENT");
  if (error) return error;

  const rl = rateLimit(`examstart:${user.id}`, 20, 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  const { examId } = (await req.json().catch(() => ({}))) as { examId?: string };
  if (!examId) return NextResponse.json({ error: "examId مطلوب" }, { status: 400 });

  const exam = await db.exam.findUnique({
    where: { id: examId },
    include: { course: true, questions: { orderBy: { position: "asc" } } },
  });
  if (!exam || !exam.published) return NextResponse.json({ error: "الاختبار غير متاح" }, { status: 404 });

  const enrollment = await db.enrollment.findFirst({
    where: { userId: user.id, courseId: exam.courseId, status: "ACTIVE" },
  });
  if (!enrollment) return NextResponse.json({ error: "يجب التسجيل في الدورة" }, { status: 403 });

  let attempt = await db.examAttempt.findUnique({
    where: { userId_examId: { userId: user.id, examId } },
  });

  if (attempt && attempt.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: "أجبت هذا الاختبار مسبقًا", attempt }, { status: 409 });
  }
  if (!attempt) {
    attempt = await db.examAttempt.create({
      data: { userId: user.id, examId, status: "IN_PROGRESS" },
    });
  }

  // MCQ answers are graded server-side only; the client never sees correctIndex.
  const questions = exam.questions.map((q) => ({
    id: q.id, text: q.text, type: q.type,
    options: q.options as string[], position: q.position,
  }));

  return NextResponse.json({
    attempt: { id: attempt.id, startedAt: attempt.startedAt, status: attempt.status },
    exam: {
      id: exam.id, title: exam.title, type: exam.type,
      durationMin: exam.durationMin, maxGrade: exam.maxGrade,
    },
    questions,
  });
}
