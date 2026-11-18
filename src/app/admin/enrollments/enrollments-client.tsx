"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent } from "@/components/ui/primitives";

/** Enrollments: one-tap approve/reject of receipt requests + manual grants. */
export function EnrollmentsClient() {
  const [data, setData] = useState<{
    requests: Array<{ id: string; user: { fullName: string; phone: string }; course: { title: string }; receiptRef: string; note?: string | null; status: string; createdAt: string }>;
    enrollments: Array<{ id: string; user: { fullName: string }; course: { title: string }; status: string; grantedVia: string }>;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/enrollments");
      setData(await res.json());
    } finally { setBusy(false); }
  };

  const decide = async (requestId: string, action: "APPROVE" | "REJECT") => {
    setBusy(true);
    try {
      await fetch("/api/admin/enrollments", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action }),
      });
      await load();
    } finally { setBusy(false); }
  };

  if (!data) {
    return <Button size="lg" className="w-full" onClick={load} disabled={busy}>{busy ? "…" : "عرض التسجيلات"}</Button>;
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
              <Card key={r.id}>
                <CardContent className="py-4">
                  <p className="font-bold">{r.user.fullName} <span className="text-xs text-gray-400" dir="ltr">{r.user.phone}</span></p>
                  <p className="text-sm text-gray-600">{r.course.title}</p>
                  <p className="mt-1 rounded-lg bg-brand-50 p-2 text-xs" dir="ltr">🧾 {r.receiptRef}</p>
                  {r.note && <p className="mt-1 text-xs text-gray-500">{r.note}</p>}
                  <div className="mt-3 flex gap-2">
                    <Button size="lg" variant="success" className="flex-1" onClick={() => decide(r.id, "APPROVE")} disabled={busy}>✓ موافقة</Button>
                    <Button size="lg" variant="destructive" className="flex-1" onClick={() => decide(r.id, "REJECT")} disabled={busy}>✗ رفض</Button>
                  </div>
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
                  <p className="font-bold">{e.user.fullName}</p>
                  <p className="text-xs text-gray-500">{e.course.title}</p>
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

      <Button variant="outline" className="w-full" onClick={load} disabled={busy}>تحديث</Button>
    </div>
  );
}
