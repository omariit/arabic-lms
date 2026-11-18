"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, Select, Label } from "@/components/ui/primitives";

type Voucher = { id: string; code: string; courseId: string; usedById?: string | null; usedAt?: string | null; course?: { title: string }; user?: { fullName: string } | null };

/** Voucher generator: create 1–50 single-use codes at once. */
export function VouchersClient() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [courses, setCourses] = useState<Array<{ id: string; title: string }>>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [courseId, setCourseId] = useState("");
  const [count, setCount] = useState(5);

  const load = async () => {
    setBusy(true);
    try {
      const [vRes, cRes] = await Promise.all([fetch("/api/admin/vouchers"), fetch("/api/admin/courses")]);
      const vData = await vRes.json();
      const cData = await cRes.json();
      setVouchers(vData.vouchers ?? []);
      setCourses(cData.courses ?? []);
      setLoaded(true);
    } finally { setBusy(false); }
  };

  const generate = async () => {
    setBusy(true);
    try {
      await fetch("/api/admin/vouchers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, count }),
      });
      await load();
    } finally { setBusy(false); }
  };

  if (!loaded) {
    return <Button size="lg" className="w-full" onClick={load} disabled={busy}>{busy ? "…" : "عرض الكوبونات"}</Button>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex items-end gap-2 pt-5">
          <div className="flex-1">
            <Label>الدورة</Label>
            <Select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">— اختاري —</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </Select>
          </div>
          <div className="w-20"><Label>العدد</Label>
            <input type="number" min={1} max={50} value={count} onChange={(e) => setCount(Math.min(50, Math.max(1, Number(e.target.value))))}
              className="h-12 w-full rounded-xl border border-brand-200 px-3 text-center font-bold outline-none" />
          </div>
          <Button onClick={generate} disabled={busy || !courseId}>توليد</Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="divide-y divide-brand-50">
          {vouchers.map((v) => (
            <div key={v.id} className="flex items-center justify-between py-3">
              <span className="font-mono text-sm font-bold" dir="ltr">{v.code}</span>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-500">{v.course?.title}</span>
                <Badge tone={v.usedById ? "red" : "green"}>{v.usedById ? `مستخدم — ${v.user?.fullName ?? ""}` : "متاح"}</Badge>
              </div>
            </div>
          ))}
          {vouchers.length === 0 && <p className="py-6 text-center text-gray-500">لا كوبونات بعد</p>}
        </CardContent>
      </Card>
    </div>
  );
}
