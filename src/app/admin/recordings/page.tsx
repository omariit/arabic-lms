import { requireTeacher } from "@/lib/auth";
import { RecordingsClient } from "./recordings-client";

export const metadata = { robots: { index: false, follow: false } };

/** Recording library: status, health, playback and lesson linking. */
export default async function RecordingsPage() {
  const user = await requireTeacher();
  return (
    <main className="mx-auto max-w-3xl px-4 pb-20 pt-4">
      <RecordingsClient isAdmin={user.role === "ADMIN"} />
    </main>
  );
}
