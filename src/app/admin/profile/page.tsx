import { ProfileClient } from "./profile-client";

export default function AdminProfilePage() {
  return (
    <main className="space-y-4">
      <h1 className="text-xl font-extrabold">⚙️ ملفي وإعداداتي</h1>
      <ProfileClient />
    </main>
  );
}
