/**
 * Who may watch a finished recording?
 *   • staff (teacher/admin/assistant) who owns the recording, or any admin
 *   • a student with an ACTIVE enrollment in the lesson's course
 *   • anyone signed in, when the lesson is a free preview
 * Pure function so the rule is testable without HTTP.
 */
export function canViewRecording(input: {
  role: string;
  userId: string;
  teacherId: string;
  lesson: { access: string } | null;
  enrolled: boolean;
}): boolean {
  const { role, userId, teacherId, lesson, enrolled } = input;
  if (role === "STUDENT") return enrolled || lesson?.access === "FREE_PREVIEW";
  if (role === "ADMIN") return true;
  return teacherId === userId;
}

