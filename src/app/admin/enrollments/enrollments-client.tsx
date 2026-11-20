"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent } from "@/components/ui/primitives";

/** Enrollments: one-tap approve/reject of receipt requests + manual grants. */
export function EnrollmentsClient() {
  const [data, setData] = useState<{
    requests: Array<{ id: string; user: { fullName: string; phone: string }; course: { title: string }; receiptRef: string; receiptUrl?: string | null; note?: string | null; status: string; createdAt: string }>;
    enrollments: Array<{ id: string; user: { fullName: string }; course: { title: string }; status: string; grantedVia: string }>;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fin, setFin] = useState<{ cliqAlias: string; bankHint: string }>({ cliqAlias: "", bankHint: "" });

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/enrollments");
      const json = await res.json().catch(() => null);
      if (!res.ok || !json) throw new Error(json?.error ?? `تعذّر تحميل التسجيلات (${res.status})`);
      // Never trust the shape: an error payload used to crash the page here.
      setData({
        requests: Array.isArray(json.requests) ? json.requests : [],
        enrollments: Array.isArray(json.enrollments) ? json.enrollments : [],
      });
      const pRes = await fetch("/api/admin/profile");
      if (pRes.ok) {
        const p = await pRes.json().catch(() => null);
        setFin({ cliqAlias: p?.profile?.cliqAlias ?? "", bankHint: p?.profile?.bankHint ?? "" });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر تحميل التسجيلات");
    } finally { setBusy(false); }
  };

  // Load immediately: an empty admin screen that waits for a click reads as "broken".
  useEffect(() => { void load(); }, []);
  const cliqAliasText = fin.cliqAlias;
  const bankHintText = fin.bankHint;

  const waStudent = (r: { user: { fullName: string; phone: string }; course: { title: string } }) => {
    // wa.me digits: stored E.164 (+9627...) → strip non-digits.
    const digits = (r.user?.phone ?? "").replace(/\D/g, "");
    const text = `مرحبًا ${r.user.fullName} 🌙\nبخصوص التسجيل في «${r.course.title}»:\nالبيانات المالية للتحويل:\n${cliqAliasText ? "• CliQ: " + cliqAliasText + "\n" : ""}${bankHintText ? "• " + bankHintText + "\n" : ""}بعد التحويل أرسلي لنا رقم الإيصال ليتم تفعيل التسجيل ✅`;
    return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
  };

  const decide = async (requestId: string, action: "APPROVE" | "REJECT") => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/enrollments", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? `تعذّر تنفيذ الطلب (${res.status})`);
      // Optimistic: drop the row immediately, then re-sync from the server.
      setData((d) =>
        d
          ? {
              requests: d.requests.map((r) => (r.id === requestId ? { ...r, status: action === "APPROVE" ? "APPROVED" : "REJECTED" } : r)),
              enrollments: d.enrollments,
            }
          : d,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر تنفيذ الطلب");
    } finally { setBusy(false); }
  };

  if (!data) {
    return (
      <div className="space-y-3">
        <Button size="lg" className="w-full" onClick={load} disabled={busy}>{busy ? "…" : "عرض التسجيلات"}</Button>
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-bold text-red-600">{error}</p>}
      </div>
    );
  }

  const pending = data.requests.filter((r) => r.status === "PENDING");

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-lg font-extrabold">⏳ طلبات بانتظار الموافقة ({pending.length})</h2>
        {pending.length === 0 ? (
          <Card><CardContent className="text-center py-6 text-gray-500">لا طلبات جديدة</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {pending.map((r) => (
              <Card key={r.id} data-testid="enroll-request">
                <CardContent className="py-4">
                  <p className="font-bold">{r.user?.fullName ?? "—"} <span className="text-xs text-gray-400" dir="ltr">{r.user?.phone ?? ""}</span></p>
                  <p className="text-sm text-gray-600">{r.course?.title ?? "—"}</p>
                  <p className="mt-1 rounded-lg bg-brand-50 p-2 text-xs" dir="ltr">🧾 {r.receiptRef}</p>
                  {r.receiptUrl && (
                    <a href={r.receiptUrl} target="_blank" rel="noopener noreferrer" className="mt-2 block">
                      <img src={r.receiptUrl} alt="إيصال التحويل" className="max-h-56 w-full rounded-xl border border-brand-100 object-contain" />
                      <span className="mt-1 block text-[11px] font-bold text-brand-700 underline">فتح صورة الإيصال بالحجم الكامل</span>
                    </a>
                  )}
                  {r.note && <p className="mt-1 text-xs text-gray-500">{r.note}</p>}
                  <div className="mt-3 flex gap-2">
                    <Button size="lg" variant="success" className="flex-1" data-testid="approve-request" onClick={() => decide(r.id, "APPROVE")} disabled={busy}>✓ موافقة</Button>
                    <Button size="lg" variant="destructive" className="flex-1" onClick={() => decide(r.id, "REJECT")} disabled={busy}>✗ رفض</Button>
                  </div>
                  <a href={waStudent(r)} target="_blank" rel="noopener noreferrer" className="mt-2 block">
                    <Button size="lg" variant="secondary" className="w-full bg-[#25D366] text-white hover:bg-[#1ebe57]">💬 إرسال البيانات المالية للطالبة على واتساب</Button>
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-extrabold">👩‍🎓 المسجلات الحاليات ({data.enrollments.filter((e) => e.status === "ACTIVE").length})</h2>
        <Card>
          <CardContent className="divide-y divide-brand-50">
            {data.enrollments.filter((e) => e.status === "ACTIVE").map((e) => (
              <div key={e.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="font-bold">{e.user?.fullName ?? "—"}</p>
                  <p className="text-xs text-gray-500">{e.course?.title ?? "—"}</p>
                </div>
                <Badge tone={e.grantedVia === "voucher" ? "amber" : "brand"}>{e.grantedVia}</Badge>
              </div>
            ))}
            {data.enrollments.filter((e) => e.status === "ACTIVE").length === 0 && (
              <p className="py-4 text-center text-gray-500">لا مسجلات بعد</p>
            )}
          </CardContent>
        </Card>
      </section>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-bold text-red-600">{error}</p>}
      <Button variant="outline" className="w-full" onClick={load} disabled={busy}>تحديث</Button>
    </div>
  );
}
