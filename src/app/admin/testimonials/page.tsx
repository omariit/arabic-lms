import { TestimonialsClient } from "./testimonials-client";

export default function AdminTestimonialsPage() {
  return (
    <main className="space-y-4">
      <h1 className="text-xl font-extrabold">💬 آراء الطالبات</h1>
      <p className="text-sm text-gray-500">تظهر في صفحة الهبوط العامة بعد النشر</p>
      <TestimonialsClient />
    </main>
  );
}
