import { db } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { StudentsClient } from "./students-client";

export default async function AdminStudentsPage() {
  await requireStaff();
  return (
    <main className="space-y-4">
      <h1 className="text-xl font-extrabold">👩‍🎓 الطالبات وأقفال الأجهزة</h1>
      <p className="text-sm text-gray-500">«تعيين كلمة مرور» تعطيها بيانات دخول جديدة، و«إعادة ضبط القفل» تسمح بالدخول من جهاز جديد</p>
      <StudentsClient />
    </main>
  );
}
