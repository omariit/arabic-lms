import { ExamsClient } from "./exams-client";

export default function AdminExamsPage() {
  return (
    <main className="space-y-4">
      <h1 className="text-xl font-extrabold">📝 باني الاختبارات</h1>
      <ExamsClient />
    </main>
  );
}
