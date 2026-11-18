import { CourseBuilder } from "./course-builder";

export default function AdminCourseBuilderPage() {
  return (
    <main className="space-y-4">
      <h1 className="text-xl font-extrabold">📚 محرر المحتوى</h1>
      <CourseBuilder />
    </main>
  );
}
