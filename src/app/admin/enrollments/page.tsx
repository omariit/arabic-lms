import { EnrollmentsClient } from "./enrollments-client";

export default function AdminEnrollmentsPage() {
  return (
    <main className="space-y-4">
      <h1 className="text-xl font-extrabold">✅ إدارة التسجيلات</h1>
      <EnrollmentsClient />
    </main>
  );
}
