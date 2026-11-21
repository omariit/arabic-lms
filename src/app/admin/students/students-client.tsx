"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, Input } from "@/components/ui/primitives";

type Student = {
  id: string; fullName: string; phone: string; createdAt: string;
  sessions: Array<{ id: string; ipAddress: string; createdAt: string }>;
  enrollments: Array<{ course: { title: string } }>;
};

/** Suggest something readable she can dictate over the phone: "Sara-Quran-3481". */
function suggestPassword(name: string) {
  const first = (name || "Taliba").trim().split(/\s+/)[0].replace(/[^\p{L}\p{N}]/gu, "") || "Taliba";
  const word = ["Quran", "Noor", "Ayat", "Hifz"][Math.floor(Math.random() * 4)];
  return `${first}-${word}-${Math.floor(1000 + Math.random() * 9000)}`;
}

/** Students console: set a new password, reset the device lock. */
export function StudentsClient() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<{ id: string; text: string; ok: boolean } | null>(null);

  const load = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/students");
      const data = await res.json().catch(() => ({}));
      setStudents(Array.isArray(data?.students) ? data.students : []);
      setLoaded(true);
    } finally { setBusy(false); }
  };

  // Load immediately: an empty admin screen that waits for a click reads as "broken".
  useEffect(() => { void load(); }, []);

  const resetDevice = async (id: string) => {
    setBusy(true);
    try {
      await fetch(`/api/admin/students/${id}/device-reset`, { method: "POST" });
      await load();
      setNotice({ id, text: "تم فتح القفل — يمكنها الدخول من جهاز جديد", ok: true });
    } finally { setBusy(false); }
  };

  const openPassword = (s: Student) => {
    setEditing(s.id);
    setDraft(suggestPassword(s.fullName));
    setNotice(null);
  };

  const savePassword = async (id: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/students/${id}/password`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: draft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ id, text: data?.error ?? "تعذّر حفظ كلمة المرور", ok: false });
        return;
      }
      setEditing(null);
      setNotice({ id, text: `تم الحفظ — كلمة المرور الآن: ${draft}`, ok: true });
      await load();
    } finally { setBusy(false); }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice((n) => (n ? { ...n, text: `${n.text} — تم النسخ ✓` } : n));
    } catch {
      /* clipboard blocked: the password is visible on screen anyway */
    }
  };

  if (!loaded) {
    return <Button size="lg" className="w-full" onClick={load} disabled={busy}>{busy ? "…" : "عرض الطالبات"}</Button>;
  }

  return (
    <div className="space-y-3">
      {students.map((s) => (
        <Card key={s.id}>
          <CardContent className="space-y-3 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold">{s.fullName}</p>
                <p className="text-xs text-gray-500" dir="ltr">{s.phone}</p>
                <p className="mt-1 text-xs text-gray-400">{s.enrollments.map((e) => e.course.title).join(" • ") || "لا دورات"}</p>
              </div>
              <div className="text-left">
                <Badge tone={s.sessions.length > 0 ? "green" : "gray"}>
                  {s.sessions.length > 0 ? "جهاز مفعّل" : "بلا جلسة"}
                </Badge>
              </div>
            </div>

            {editing === s.id ? (
              <div className="space-y-2 rounded-2xl bg-brand-50 p-3">
                <label className="block text-xs font-bold text-brand-900" htmlFor={`pw-${s.id}`}>
                  كلمة مرور جديدة (8 أحرف على الأقل)
                </label>
                <Input
                  id={`pw-${s.id}`}
                  dir="ltr"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Sara-Quran-3481"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => savePassword(s.id)} disabled={busy || draft.trim().length < 8}>
                    حفظ وإبلاغ الطالبة
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => copy(draft)} type="button">نسخ</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)} type="button">إلغاء</Button>
                </div>
                <p className="text-[11px] text-brand-900/60">
                  سيتم إنهاء أي جلسة مفتوحة لها، ثم تدخل بالرقم {s.phone} وهذه الكلمة.
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => openPassword(s)}>تعيين كلمة مرور</Button>
                {s.sessions.length > 0 && (
                  <Button size="sm" variant="destructive" onClick={() => resetDevice(s.id)} disabled={busy}>
                    إعادة ضبط القفل
                  </Button>
                )}
              </div>
            )}

            {notice?.id === s.id && (
              <p
                className={`rounded-xl px-3 py-2 text-xs font-bold ${notice.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}
                dir={notice.ok && notice.text.includes("كلمة المرور الآن") ? "auto" : "rtl"}
              >
                {notice.text}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
      {students.length === 0 && <Card><CardContent className="py-8 text-center text-gray-500">لا طالبات بعد</CardContent></Card>}
      <Button variant="outline" className="w-full" onClick={load} disabled={busy}>تحديث</Button>
    </div>
  );
}
