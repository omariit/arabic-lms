"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent } from "@/components/ui/primitives";
import { formatDateAr } from "@/lib/utils";

type Violation = { id: string; type: string; detail: string; ipAddress?: string | null; createdAt: string; user?: { fullName: string; phone: string } | null };

/** Security violation log viewer. */
export function ViolationsClient() {
  const [violations, setViolations] = useState<Violation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/violations");
      const data = await res.json();
      setViolations(data.violations ?? []);
      setLoaded(true);
    } finally { setBusy(false); }
  };

  // Load immediately: an empty admin screen that waits for a click reads as "broken".
  useEffect(() => { void load(); }, []);

  if (!loaded) {
    return <Button size="lg" className="w-full" onClick={load} disabled={busy}>{busy ? "…" : "عرض السجل"}</Button>;
  }

  return (
    <div className="space-y-3">
      {violations.map((v) => (
        <Card key={v.id}>
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">{v.user?.fullName ?? "غير معروف"}</span>
              <Badge tone="red">{v.type}</Badge>
            </div>
            <p className="mt-1 text-xs text-gray-500" dir="ltr">{v.detail}</p>
            <p className="text-[10px] text-gray-400">{formatDateAr(v.createdAt)} • <span dir="ltr">{v.ipAddress}</span></p>
          </CardContent>
        </Card>
      ))}
      {violations.length === 0 && <Card><CardContent className="text-center py-8 text-gray-500">لا مخالفات مسجلة 🎉</CardContent></Card>}
    </div>
  );
}
