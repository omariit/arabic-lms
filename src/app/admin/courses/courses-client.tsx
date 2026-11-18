"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Input, Label, Badge } from "@/components/ui/primitives";

type Course = { id: string; title: string; description: string; price: number; level: string; published: boolean; _count?: { modules: number; enrollments: number } };

/** Course list + create/publish — links to the full builder. */
export function CoursesClient() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("0");

  const load = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/courses");
      const data = await res.json();
      setCourses(data.courses ?? []);
      setLoaded(true);
    } finally { setBusy(false); }
  };

  const create = async () => {
    setBusy(true);
    try {
      await fetch("/api/admin/courses", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, price: Number(price) }),
      });
      setTitle("");
      await load();
    } finally { setBusy(false); }
  };

  const togglePublish = async (c: Course) => {
    setBusy(true);
    try {
      await fetch(`/api/admin/courses/${c.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: !c.published }),
      });
      await load();
    } finally { setBusy(false); }
  };

  if (!loaded) {
    return <Button size="lg" className="w-full" onClick={load} disabled={busy}>{busy ? "…" : "عرض دوراتي"}</Button>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-5">
          <div className="flex gap-2">
            <Input placeholder="عنوان الدورة الجديدة" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Input dir="ltr" type="number" className="w-24" value={price} onChange={(e) => setPrice(e.target.value)} />
            <Button onClick={create} disabled={busy || !title.trim}>إنشاء</Button>
          </div>
        </CardContent>
      </Card>

      {courses.map((c) => (
        <Card key={c.id}>
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <p className="font-bold">{c.title}</p>
              <div className="mt-1 flex gap-2">
                <Badge tone={c.published ? "green" : "gray"}>{c.published ? "منشورة" : "مسودة"}</Badge>
                <Badge tone="brand">{c.price === 0 ? "مجانية" : `${c.price} دينار`}</Badge>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Link href={`/admin/courses/${c.id}`}><Button size="sm">تحرير الدروس</Button></Link>
              <Button size="sm" variant="secondary" onClick={() => togglePublish(c)} disabled={busy}>
                {c.published ? "إلغاء النشر" : "نشر"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
