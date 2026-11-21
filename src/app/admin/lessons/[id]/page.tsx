import { db } from "@/lib/db";
import { requireTeacher } from "@/lib/auth";
import { LessonInbox } from "./lesson-inbox";

/** Staff lesson workspace: assignment editor + every student's private thread. */
export default async function AdminLessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireTeacher();
  const { id } = await params;
  const sp = await searchParams;
  const initialStudent = typeof sp.student === "string" ? sp.student : undefined;
  const lesson = await db.lesson.findUnique({
    where: { id },
    select: {
      id: true, title: true, description: true, scriptText: true,
      assignmentTitle: true, assignmentInstructions: true,
      module: { select: { course: { select: { id: true, title: true } } } },
    },
  });
  if (!lesson) {
    return <p className="p-6 text-sm text-brand-900/60">الدرس غير موجود</p>;
  }
  return (
    <LessonInbox
      initialStudent={initialStudent}
      lesson={{
        id: lesson.id,
        title: lesson.title,
        description: lesson.description,
        scriptText: lesson.scriptText,
        assignmentTitle: lesson.assignmentTitle ?? "",
        assignmentInstructions: lesson.assignmentInstructions,
        courseTitle: lesson.module.course.title,
        courseId: lesson.module.course.id,
      }}
    />
  );
}
