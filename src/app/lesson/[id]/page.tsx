import Link from "next/link";
import { db } from "@/lib/db";
import { requireStudent } from "@/lib/auth";
import { ProtectedPlayer } from "@/components/protected-player";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Lesson playback page: protected, watermarked player — enrollment verified server-side. */
export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireStudent();

  const lesson = await db.lesson.findUnique({
    where: { id },
    include: { module: { include: { course: true } } },
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

  return (
    <main className="mx-auto max-w-3xl px-4 pb-20 pt-6">
      <p className="mb-2 text-xs text-gray-500">
        {lesson.module.course.title} ← {lesson.module.title}
      </p>
      <h1 className="mb-4 text-2xl font-extrabold">{lesson.title}</h1>

      <ProtectedPlayer lessonId={lesson.id} studentName={user.fullName} studentPhone={user.phone} />

      <p className="mt-3 rounded-xl bg-brand-50 p-3 text-xs text-brand-800">
        🛡️ هذا الدرس محمي بعلامة مائية باسمك ورقم هاتفك — محاولات التسريب تُسجَّل وتؤدي لإيقاف الحساب.
      </p>

      <div className="mt-6 text-center">
        <Link href={`/courses/${lesson.module.courseId}`} className="text-sm font-bold text-brand-600 underline">
          → عودة إلى الدورة
        </Link>
      </div>
    </main>
  );
}
