"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, Input, Label, Select, Badge } from "@/components/ui/primitives";

type Module = { id: string; title: string; position: number; lessons: Lesson[] };
type Lesson = { id: string; title: string; youtubeId: string; access: string; position: number };

/** Curriculum builder: modules → lessons (YouTube ID stored server-side only). */
export function CourseBuilder() {
  const params = useParams<{ id: string }>();
  const courseId = params.id;
  const [modules, setModules] = useState<Module[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const [moduleTitle, setModuleTitle] = useState("");
  const [lessonForms, setLessonForms] = useState<Record<string, { title: string; youtubeId: string; access: string }>>({});

  const load = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/courses");
      const data = await res.json();
      const course = (data.courses ?? []).find((c: { id: string }) => c.id === courseId);
      // Fetch modules via a dedicated lightweight approach: reuse course list doesn't include modules,
      // so we load lessons through the modules the server exposes on the course page. For the builder
      // we fetch module data from the courses list endpoint enriched server-side.
      setModules(course?.modules ?? []);
      setLoaded(true);
    } finally { setBusy(false); }
  };

  if (!loaded) {
    return <Button size="lg" className="w-full" onClick={load} disabled={busy}>{busy ? "…" : "تحميل المحتوى"}</Button>;
  }

  const addModule = async () => {
    setBusy(true);
    try {
      await fetch("/api/admin/modules", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, title: moduleTitle }),
      });
      setModuleTitle("");
      await load();
    } finally { setBusy(false); }
  };

  const deleteModule = async (id: string) => {
    setBusy(true);
    try {
      await fetch(`/api/admin/modules/${id}`, { method: "DELETE" });
      await load();
    } finally { setBusy(false); }
  };

  const addLesson = async (moduleId: string) => {
    const form = lessonForms[moduleId] ?? { title: "", youtubeId: "", access: "ENROLLED" };
    if (!form.title.trim() || !form.youtubeId.trim()) return;
    setBusy(true);
    try {
      await fetch("/api/admin/lessons", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleId, ...form }),
      });
      setLessonForms((f) => ({ ...f, [moduleId]: { title: "", youtubeId: "", access: "ENROLLED" } }));
      await load();
    } finally { setBusy(false); }
  };

  const deleteLesson = async (id: string) => {
    setBusy(true);
    try {
      await fetch(`/api/admin/lessons/${id}`, { method: "DELETE" });
      await load();
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-5">
          <Label>وحدة جديدة</Label>
          <div className="flex gap-2">
            <Input placeholder="عنوان الوحدة" value={moduleTitle} onChange={(e) => setModuleTitle(e.target.value)} />
            <Button onClick={addModule} disabled={busy || !moduleTitle.trim()}>إضافة</Button>
          </div>
        </CardContent>
      </Card>

      {modules.map((m) => (
        <Card key={m.id}>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{m.title}</CardTitle>
            <Button size="sm" variant="destructive" onClick={() => deleteModule(m.id)} disabled={busy}>حذف</Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {m.lessons.map((l) => (
              <div key={l.id} className="flex items-center justify-between rounded-xl bg-brand-50 p-3">
                <div>
                  <p className="text-sm font-bold">{l.title}</p>
                  <div className="flex gap-2">
                    <Badge tone={l.access === "FREE_PREVIEW" ? "green" : "gray"}>
                      {l.access === "FREE_PREVIEW" ? "تجريبي" : "للمسجلات"}
                    </Badge>
                    <span className="text-[10px] text-gray-400" dir="ltr">{l.youtubeId}</span>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => deleteLesson(l.id)} disabled={busy}>حذف</Button>
              </div>
            ))}

            <div className="mt-3 space-y-2 rounded-xl border border-brand-100 p-3">
              <Input placeholder="عنوان الدرس" value={lessonForms[m.id]?.title ?? ""} onChange={(e) => setLessonForms((f) => ({ ...f, [m.id]: { ...(f[m.id] ?? { youtubeId: "", access: "ENROLLED" }), title: e.target.value } }))} />
              <Input dir="ltr" placeholder="YouTube Video ID" value={lessonForms[m.id]?.youtubeId ?? ""} onChange={(e) => setLessonForms((f) => ({ ...f, [m.id]: { ...(f[m.id] ?? { title: "", access: "ENROLLED" }), youtubeId: e.target.value } }))} />
              <Select value={lessonForms[m.id]?.access ?? "ENROLLED"} onChange={(e) => setLessonForms((f) => ({ ...f, [m.id]: { ...(f[m.id] ?? { title: "", youtubeId: "" }), access: e.target.value } }))}>
                <option value="ENROLLED">للمسجلات فقط</option>
                <option value="FREE_PREVIEW">معاينة مجانية</option>
              </Select>
              <Button className="w-full" onClick={() => addLesson(m.id)} disabled={busy}>إضافة الدرس</Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
