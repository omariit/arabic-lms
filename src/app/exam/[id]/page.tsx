import { db } from "@/lib/db";
import { requireStudent } from "@/lib/auth";
import { ExamRunner } from "./exam-runner";
import { VoiceExam } from "./voice-exam";

export default async function ExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireStudent();

  const exam = await db.exam.findUnique({
    where: { id },
    include: { course: { select: { id: true, title: true } } },
  });
  if (!exam || !exam.published) {
    return <main className="mx-auto max-w-3xl px-4 py-16 text-center">الاختبار غير متاح</main>;
  }

  const enrollment = await db.enrollment.findFirst({
    where: { userId: user.id, courseId: exam.courseId, status: "ACTIVE" },
  });
  if (!enrollment) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="font-bold">يجب التسجيل في «{exam.course.title}» قبل دخول الاختبار</p>
      </main>
    );
  }

  if (exam.type === "VOICE") {
    const attempt = await db.examAttempt.findUnique({
      where: { userId_examId: { userId: user.id, examId: exam.id } },
    });
    if (attempt && attempt.status !== "IN_PROGRESS") {
      return (
        <main className="mx-auto max-w-3xl px-4 py-16 text-center">
          <p className="font-bold text-emerald-700">✓ تم إرسال تسجيلك الصوتي</p>
          <p className="mt-2 text-sm text-gray-500">سيتم التصحيح من المعلمة — تظهر النتيجة والتعليق الصوتي في لوحتك</p>
        </main>
      );
    }
    return <main className="mx-auto max-w-3xl px-4 pb-20 pt-6"><VoiceExam examId={exam.id} title={exam.title} durationMin={exam.durationMin} /></main>;
  }

  // MCQ
  const attempt = await db.examAttempt.findUnique({
    where: { userId_examId: { userId: user.id, examId: exam.id } },
  });
  return (
    <main className="mx-auto max-w-3xl px-4 pb-20 pt-6">
      <ExamRunner
        examId={exam.id}
        title={exam.title}
        durationMin={exam.durationMin}
        maxGrade={exam.maxGrade}
        courseTitle={exam.course.title}
        previousStatus={attempt?.status ?? null}
      />
    </main>
  );
}
