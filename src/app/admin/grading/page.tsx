import { GradingClient } from "./grading-client";

export default function AdminGradingPage() {
  return (
    <main className="space-y-4">
      <h1 className="text-xl font-extrabold">🎤 طابور التصحيح الصوتي</h1>
      <p className="text-sm text-gray-500">استمعي لتسجيل الطالبة، أعطي الدرجة، واكتبي أو سجّلي تعليقك الصوتي</p>
      <GradingClient />
    </main>
  );
}
