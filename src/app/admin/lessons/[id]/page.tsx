import { db } from "@/lib/db";
import { requireTeacher } from "@/lib/auth";
import { LessonInbox } from "./lesson-inbox";

/** Staff lesson workspace: assignment editor + every student's private thread. */
export default async function AdminLessonPage({ params }: { params: Promise<{ id: string }> }) {
  await requireTeacher();
  const { id } = await params;
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
