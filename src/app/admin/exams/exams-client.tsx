"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, Input, Label, Select } from "@/components/ui/primitives";

type Exam = { id: string; courseId: string; title: string; type: string; durationMin: number; maxGrade: number; published: boolean; course?: { title: string }; _count?: { questions: number } };

/** Exam builder list: create MCQ or VOICE exams, publish, open the question editor. */
export function ExamsClient() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [courses, setCourses] = useState<Array<{ id: string; title: string }>>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: "", courseId: "", type: "MCQ", durationMin: 15, maxGrade: 100 });

  const load = async () => {
    setBusy(true);
    try {
      const [exRes, cRes] = await Promise.all([fetch("/api/admin/exams"), fetch("/api/admin/courses")]);
      const exData = await exRes.json();
      const cData = await cRes.json();
      setExams(exData.exams ?? []);
      setCourses(cData.courses ?? []);
      setLoaded(true);
    } finally { setBusy(false); }
  };

  const create = async () => {
    setBusy(true);
    try {
      await fetch("/api/admin/exams", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setForm({ ...form, title: "" });
      await load();
    } finally { setBusy(false); }
  };

  const togglePublish = async (e: Exam) => {
    setBusy(true);
    try {
      await fetch(`/api/admin/exams/${e.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: !e.published }),
      });
      await load();
    } finally { setBusy(false); }
  };

  if (!loaded) {
    return <Button size="lg" className="w-full" onClick={load} disabled={busy}>{busy ? "…" : "عرض الاختبارات"}</Button>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-5">
          <div><Label>عنوان الاختبار</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div>
            <Label>الدورة</Label>
            <Select value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })}>
              <option value="">— اختاري —</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </Select>
          </div>
          <div className="flex gap-2">
            <div className="flex-1"><Label>النوع</Label>
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="MCQ">إلكتروني (اختيار من متعدد)</option>
                <option value="VOICE">صوتي (تصحيح يدوي)</option>
              </Select>
            </div>
            <div className="w-24"><Label>دقائق</Label><Input dir="ltr" type="number" value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: Number(e.target.value) })} /></div>
            <div className="w-24"><Label>الدرجة</Label><Input dir="ltr" type="number" value={form.maxGrade} onChange={(e) => setForm({ ...form, maxGrade: Number(e.target.value) })} /></div>
          </div>
          <Button className="w-full" onClick={create} disabled={busy || !form.title.trim() || !form.courseId}>إنشاء الاختبار</Button>
        </CardContent>
      </Card>

      {exams.map((e) => (
        <Card key={e.id}>
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <p className="font-bold">{e.title}</p>
              <p className="text-xs text-gray-500">{e.course?.title} • {e.type === "VOICE" ? "صوتي" : "إلكتروني"} • {e.durationMin} دقيقة</p>
            </div>
            <div className="flex flex-col gap-2">
              <Link href={`/admin/exams/${e.id}`}><Button size="sm">الأسئلة</Button></Link>
              <Button size="sm" variant="secondary" onClick={() => togglePublish(e)} disabled={busy}>
                {e.published ? "إلغاء النشر" : "نشر"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
