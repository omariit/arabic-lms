import { StudentsClient } from "./students-client";

export default function AdminStudentsPage() {
  return (
    <main className="space-y-4">
      <h1 className="text-xl font-extrabold">👩‍🎓 الطالبات وأقفال الأجهزة</h1>
      <p className="text-sm text-gray-500">«إعادة ضبط القفل» تسمح للطالبة بتسجيل الدخول من جهاز جديد</p>
      <StudentsClient />
    </main>
  );
}
