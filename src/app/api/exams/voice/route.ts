import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

/** Register a voice-exam submission after the browser uploaded the audio to R2. */
export async function POST(req: Request) {
  const { user, error } = await apiUser("STUDENT");
  if (error) return error;

  const rl = rateLimit(`voicesubmit:${user.id}`, 10, 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  const body = (await req.json().catch(() => ({}))) as {
    examId?: string; key?: string; mimeType?: string; audioId?: string;
  };
  if (!body.examId || !body.key) return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });

  const exam = await db.exam.findUnique({ where: { id: body.examId }, include: { course: true } });
  if (!exam || !exam.published) return NextResponse.json({ error: "الاختبار غير متاح" }, { status: 404 });

  const enrollment = await db.enrollment.findFirst({
    where: { userId: user.id, courseId: exam.courseId, status: "ACTIVE" },
  });
  if (!enrollment) return NextResponse.json({ error: "يجب التسجيل في الدورة" }, { status: 403 });

  let attempt = await db.examAttempt.findUnique({
    where: { userId_examId: { userId: user.id, examId: exam.id } },
  });
  if (!attempt) {
    attempt = await db.examAttempt.create({
      data: { userId: user.id, examId: exam.id, status: "SUBMITTED", submittedAt: new Date() },
    });
  } else if (attempt.status === "SUBMITTED" || attempt.status === "GRADED") {
    return NextResponse.json({ error: "تم إرسال تسجيلك مسبقًا" }, { status: 409 });
  } else {
    attempt = await db.examAttempt.update({
      where: { id: attempt.id },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });
  }

  // Cross-check the R2 key actually belongs to this user's submission namespace.
  if (!body.key.startsWith(`submission/${new Date().toISOString().slice(0, 10)}/${user.id}/`) &&
      !body.audioId) {
    return NextResponse.json({ error: "مفتاح الملف غير صالح" }, { status: 400 });
  }

  const submission = await db.audioSubmission.create({
    data: {
      attemptId: attempt.id,
      userId: user.id,
      examId: exam.id,
      audioKey: body.key,
      mimeType: body.mimeType || "audio/webm",
    },
  });

  return NextResponse.json({ ok: true, attemptId: attempt.id, submissionId: submission.id });
}
