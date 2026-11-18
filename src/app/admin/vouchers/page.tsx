import { VouchersClient } from "./vouchers-client";

export default function AdminVouchersPage() {
  return (
    <main className="space-y-4">
      <h1 className="text-xl font-extrabold">🎟️ مولّد الكوبونات</h1>
      <VouchersClient />
    </main>
  );
}
