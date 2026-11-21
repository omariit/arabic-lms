import { requireStaff } from "@/lib/auth";
import { InboxClient } from "./inbox-client";

export const metadata = { robots: { index: false, follow: false } };

/** Staff: every lesson assignment conversation (student audio/text) in one place. */
export default async function StaffInboxPage() {
  await requireStaff();
  return (
    <main className="mx-auto max-w-3xl px-4 pb-20 pt-2">
      <header className="mb-4">
        <h1 className="text-xl font-extrabold">📥 واجبات الطالبات</h1>
        <p className="text-sm text-gray-500">
          كل تسليم أو سؤال على درس — نصًا أو صوتًا — يظهر هنا. افتحي المحادثة للاستماع والرد.
        </p>
      </header>
      <InboxClient />
    </main>
  );
}
