import { ExamBuilder } from "./exam-builder";

export const metadata = { robots: { index: false, follow: false } };

export default function AdminExamBuilderPage() {
  return (
    <main className="space-y-4">
      <h1 className="text-xl font-extrabold">📝 محرر الاختبار</h1>
      <ExamBuilder />
    </main>
  );
}
