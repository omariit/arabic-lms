import { CoursesClient } from "./courses-client";

export default function AdminCoursesPage() {
  return (
    <main className="space-y-4">
      <h1 className="text-xl font-extrabold">📚 الدورات</h1>
      <CoursesClient />
    </main>
  );
}
