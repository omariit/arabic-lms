"use client";

import { useEffect, useState } from "react";

type Assistant = { id: string; fullName: string; phone: string; createdAt: string };

const COUNTRIES = [
  { code: "JO", label: "الأردن (+962)" },
  { code: "SA", label: "السعودية (+966)" },
  { code: "PS", label: "فلسطين (+970)" },
  { code: "EG", label: "مصر (+20)" },
  { code: "AE", label: "الإمارات (+971)" },
  { code: "US", label: "أمريكا (+1)" },
];

export function StaffManager() {
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("JO");
  const [created, setCreated] = useState<{ fullName: string; phone: string; password: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    fetch("/api/admin/staff", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setAssistants(j?.assistants ?? []))
      .catch(() => setAssistants([]));

  useEffect(() => { load(); }, []);

  const add = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: name, phone, countryCode: country }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error ?? `تعذّرت الإضافة (${res.status}) — أعيدي المحاولة`); return; }
      setCreated({ fullName: j.assistant.fullName, phone: j.assistant.phone, password: j.password });
      setName(""); setPhone("");
      load();
    } catch {
      setError("تعذّر الاتصال بالخادم — تحقّقي من الإنترنت وأعيدي المحاولة");
    } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    if (!confirm("حذف هذه المساعدة؟ لن تستطيع الدخول بعدها.")) return;
    await fetch("/api/admin/staff", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-brand-100 bg-white p-5 shadow-sm">
        <h1 className="text-lg font-extrabold text-brand-950">🤝 فريق المساعدة</h1>
        <p className="mt-1 text-xs text-brand-900/60">
          المساعدة تتابع رسائل الطالبات من صندوق الرسائل عندما تكونين غير متاحة. لها صلاحية المحادثات فقط.
        </p>
      </div>

      {created && (
        <div className="rounded-3xl border-2 border-amber-300 bg-amber-50 p-5">
          <p className="text-sm font-extrabold text-emerald-950">✅ تمت إضافة {created.fullName}</p>
          <p className="mt-2 text-xs font-bold text-emerald-900/70" dir="ltr">{created.phone}</p>
          <p className="mt-1 text-xs text-emerald-900/60">كلمة المرور — احفظيها الآن، تُعرض مرة واحدة فقط:</p>
          <p className="mt-1 rounded-xl bg-white px-3 py-2 text-center text-lg font-extrabold tracking-wide text-emerald-950" dir="ltr">{created.password}</p>
          <button onClick={() => setCreated(null)} className="mt-3 text-xs font-bold text-brand-700 underline">تم الحفظ — إغلاق</button>
        </div>
      )}

      <div className="rounded-3xl border border-brand-100 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-extrabold text-brand-950">➕ إضافة مساعدة</h2>
        <div className="space-y-2">
          <input className="w-full rounded-xl border border-brand-100 bg-brand-50/50 px-3 py-2.5 text-sm" placeholder="الاسم" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="flex gap-2">
            <select className="rounded-xl border border-brand-100 bg-brand-50/50 px-2 py-2.5 text-sm" value={country} onChange={(e) => setCountry(e.target.value)}>
              {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
            <input dir="ltr" className="flex-1 rounded-xl border border-brand-100 bg-brand-50/50 px-3 py-2.5 text-sm" placeholder="07xxxxxxxx" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          {error && <p className="text-xs font-bold text-red-600">{error}</p>}
          <button onClick={add} disabled={busy || !name.trim() || !phone.trim()} className="w-full rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-50">
            إضافة
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-brand-100 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-extrabold text-brand-950">المساعدات ({assistants.length})</h2>
        {assistants.length === 0 ? (
          <p className="text-xs text-brand-900/50">لا توجد مساعدات بعد</p>
        ) : (
          assistants.map((a) => (
            <div key={a.id} className="mb-2 flex items-center justify-between rounded-2xl border border-brand-100 bg-brand-50/40 p-3">
              <div>
                <p className="text-sm font-extrabold text-brand-950">{a.fullName}</p>
                <p className="text-[11px] text-brand-900/50" dir="ltr">{a.phone}</p>
              </div>
              <button onClick={() => remove(a.id)} className="rounded-xl border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600">حذف</button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
