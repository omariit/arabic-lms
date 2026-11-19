import { requireAdmin } from "@/lib/auth";
import { ViolationsClient } from "./violations-client";

export default async function AdminViolationsPage() {
  await requireAdmin();
  return (
    <main className="space-y-4">
      <h1 className="text-xl font-extrabold">🛡️ سجل الحماية</h1>
      <p className="text-sm text-gray-500">عبث العلامة المائية، مغادرة الصفحة أثناء الاختبار، ومحاولات الأجهزة المختلفة</p>
      <ViolationsClient />
    </main>
  );
}
