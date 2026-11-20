import { db } from "@/lib/db";
import { requireStudent } from "@/lib/auth";
import { ExamRunner } from "./exam-runner";
import { VoiceExam } from "./voice-exam";


export const metadata = { robots: { index: false, follow: false } };
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
  if (attempt && attempt.status !== "IN_PROGRESS") {
    const score = attempt.manualGrade ?? attempt.autoScore ?? null;
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <p className="text-4xl">✓</p>
          <p className="mt-2 text-lg font-extrabold text-emerald-900">أجبتِ هذا الاختبار مسبقًا</p>
          {score !== null && (
            <p className="mt-2 text-2xl font-extrabold text-emerald-800" dir="ltr">
              {score} / {exam.maxGrade}
            </p>
          )}
          <p className="mt-2 text-xs text-emerald-900/70">
            {attempt.status === "GRADED"
              ? "صحّحتها المعلمة — تجدين الملاحظات ورسالتها الصوتية في لوحتك."
              : "بانتظار تصحيح المعلمة — تظهر النتيجة في لوحتك تلقائيًا."}
          </p>
          <a
            href="/dashboard"
            className="mt-5 inline-block rounded-xl bg-brand-700 px-6 py-2.5 text-sm font-extrabold text-white"
          >
            عودة إلى لوحتي
          </a>
        </div>
      </main>
    );
  }
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
