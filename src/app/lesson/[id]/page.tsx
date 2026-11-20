import Link from "next/link";
import { db } from "@/lib/db";
import { requireStudent } from "@/lib/auth";
import { ProtectedPlayer } from "@/components/protected-player";
import { LessonWorkspace } from "./lesson-workspace";
import { LessonAudioPlayer } from "@/components/lesson-audio";
import { LessonResourcesView } from "@/components/course-extras";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Lesson playback page: protected, watermarked player — enrollment verified server-side. */

export const metadata = { robots: { index: false, follow: false } };
export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireStudent();

  const lesson = await db.lesson.findUnique({
    where: { id },
    include: { module: { include: { course: true } }, resources: true },
  });
  if (!lesson) {
    return <main className="mx-auto max-w-3xl px-4 py-16 text-center">الدرس غير موجود</main>;
  }

  const enrollment = await db.enrollment.findFirst({
    where: { userId: user.id, courseId: lesson.module.courseId, status: "ACTIVE" },
  });
  if (lesson.access !== "FREE_PREVIEW" && !enrollment) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="mb-4 font-bold">هذا الدرس متاح للمسجلات في الدورة فقط</p>
        <Link href={`/courses/${lesson.module.courseId}`} className={cn(buttonVariants())}>عرض الدورة</Link>
      </main>
    );
  }

  const hasWorkspace = !!enrollment; // enrolled students get the assignment workspace + private thread

  return (
    <main className="mx-auto max-w-3xl px-4 pb-20 pt-6">
      <p className="mb-2 text-xs text-gray-500">
        {lesson.module.course.title} ← {lesson.module.title}
      </p>
      <h1 className="mb-4 text-2xl font-extrabold">{lesson.title}</h1>

      <ProtectedPlayer lessonId={lesson.id} studentName={user.fullName} studentPhone={user.phone} />

      {lesson.audioKey && <div className="mt-4"><LessonAudioPlayer lessonId={lesson.id} title={lesson.title} /></div>}

      {lesson.description && (
        <div className="mt-4 rounded-2xl border border-brand-100 bg-white p-4">
          <p className="mb-1 text-sm font-extrabold text-brand-900">📖 وصف الدرس</p>
          <p className="whitespace-pre-line text-sm leading-7 text-brand-900/80">{lesson.description}</p>
        </div>
      )}

      {lesson.scriptText && (
        <details className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <summary className="cursor-pointer text-sm font-extrabold text-emerald-900">📜 النص الكامل للدرس</summary>
          <p className="mt-2 whitespace-pre-line text-sm leading-8 text-emerald-900/80">{lesson.scriptText}</p>
        </details>
      )}

      <LessonResourcesView
        lessonId={lesson.id}
        items={lesson.resources.map((r) => ({ id: r.id, title: r.title, mimeType: r.mimeType, size: r.size }))}
      />

      <p className="mt-3 rounded-xl bg-brand-50 p-3 text-xs text-brand-800">
        🛡️ هذا الدرس محمي بعلامة مائية باسمك ورقم هاتفك — محاولات التسريب تُسجَّل وتؤدي لإيقاف الحساب.
      </p>

      {hasWorkspace && (
        <LessonWorkspace
          lessonId={lesson.id}
          initialAssignment={
            lesson.assignmentTitle
              ? { title: lesson.assignmentTitle, instructions: lesson.assignmentInstructions }
              : null
          }
        />
      )}

      <div className="mt-6 text-center">
        <Link href={`/courses/${lesson.module.courseId}`} className="text-sm font-bold text-brand-600 underline">
          → عودة إلى الدورة
        </Link>
      </div>
    </main>
  );
}
