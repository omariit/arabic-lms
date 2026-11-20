"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Public entry for invited guests: name only, then the host admits them from the lobby. */
export function GuestEntry({ liveId, title, onEnter }: {
  liveId: string;
  title: string;
  onEnter: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (clean.length < 2) {
      setError("اكتبي اسمك (حرفان على الأقل)");
      return;
    }
    sessionStorage.setItem(`guest-${liveId}`, clean);
    onEnter(clean);
  };

  return (
    <div className="mx-auto max-w-md rounded-3xl border border-brand-100 bg-white p-6 shadow-sm">
      <p className="text-xs font-extrabold text-brand-700">🎟️ دعوة لحضور حصة</p>
      <h1 className="mt-1 text-lg font-extrabold text-brand-950">{title}</h1>
      <p className="mt-2 text-xs leading-6 text-brand-900/60">
        أدخلي اسمك للانضمام إلى الحصة. لن تحتاجي إلى حساب، وستوافق المعلمة على دخولك.
      </p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="اسمك"
          className="w-full rounded-xl border border-brand-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500"
        />
        {error && <p className="text-xs font-bold text-red-600">{error}</p>}
        <Button type="submit" size="lg" className="w-full">دخول الحصة</Button>
      </form>
      <p className="mt-3 text-[10px] leading-5 text-brand-900/45">
        بالدخول توافقين على آداب الحصة: احترام المعلمة والطالبات، وعدم تسجيل أو نشر الحصة.
      </p>
    </div>
  );
}
