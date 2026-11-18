import { ExamBuilder } from "./exam-builder";

export default function AdminExamBuilderPage() {
  return (
    <main className="space-y-4">
      <h1 className="text-xl font-extrabold">📝 محرر الأسئلة</h1>
      <ExamBuilder />
    </main>
  );
}
