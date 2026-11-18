"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent } from "@/components/ui/primitives";

type Student = {
  id: string; fullName: string; phone: string; createdAt: string;
  sessions: Array<{ id: string; ipAddress: string; createdAt: string }>;
  enrollments: Array<{ course: { title: string } }>;
};

/** Students + device lock reset console. */
export function StudentsClient() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/students");
      const data = await res.json();
      setStudents(data.students ?? []);
      setLoaded(true);
    } finally { setBusy(false); }
  };

  const resetDevice = async (id: string) => {
    setBusy(true);
    try {
      await fetch(`/api/admin/students/${id}/device-reset`, { method: "POST" });
      await load();
    } finally { setBusy(false); }
  };

  if (!loaded) {
    return <Button size="lg" className="w-full" onClick={load} disabled={busy}>{busy ? "…" : "عرض الطالبات"}</Button>;
  }

  return (
    <div className="space-y-3">
      {students.map((s) => (
        <Card key={s.id}>
          <CardContent className="py-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-bold">{s.fullName}</p>
                <p className="text-xs text-gray-500" dir="ltr">{s.phone}</p>
                <p className="mt-1 text-xs text-gray-400">{s.enrollments.map((e) => e.course.title).join(" • ") || "لا دورات"}</p>
              </div>
              <div className="text-left">
                <Badge tone={s.sessions.length > 0 ? "green" : "gray"}>
                  {s.sessions.length > 0 ? "جهاز مفعّل" : "بلا جلسة"}
                </Badge>
                {s.sessions.length > 0 && (
                  <Button size="sm" variant="destructive" className="mt-2 w-full" onClick={() => resetDevice(s.id)} disabled={busy}>
                    إعادة ضبط القفل
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      {students.length === 0 && <Card><CardContent className="text-center py-8 text-gray-500">لا طالبات بعد</CardContent></Card>}
      <Button variant="outline" className="w-full" onClick={load} disabled={busy}>تحديث</Button>
    </div>
  );
}
