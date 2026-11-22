"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, Input, Label, Select, Textarea } from "@/components/ui/primitives";

type Testimonial = { id: string; name: string; text: string; level?: string | null; rating: number; published: boolean };

export function TestimonialsClient() {
  const [items, setItems] = useState<Testimonial[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", text: "", level: "", rating: 5, published: true });

  const load = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/testimonials");
      const data = await res.json();
      setItems(data.testimonials ?? []);
      setLoaded(true);
    } finally { setBusy(false); }
  };

  // Load immediately: an empty admin screen that waits for a click reads as "broken".
  useEffect(() => { void load(); }, []);

  const create = async () => {
    setBusy(true);
    try {
      await fetch("/api/admin/testimonials", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      setForm({ name: "", text: "", level: "", rating: 5, published: true });
      await load();
    } finally { setBusy(false); }
  };

  const togglePublish = async (t: Testimonial) => {
    setBusy(true);
    try {
      await fetch(`/api/admin/testimonials/${t.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ published: !t.published }),
      });
      await load();
    } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await fetch(`/api/admin/testimonials/${id}`, { method: "DELETE" });
      await load();
    } finally { setBusy(false); }
  };

  if (!loaded) {
    return <Button size="lg" className="w-full" onClick={load} disabled={busy}>{busy ? "…" : "عرض آراء الطالبات"}</Button>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-5">
          <div><Label>اسم الطالبة (أو الحرف الأول)</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>نص الرأي</Label><Textarea value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} /></div>
          <div className="flex gap-2">
            <div className="flex-1"><Label>المستوى</Label><Input placeholder="مثال: المستوى الثاني — القراءات" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} /></div>
            <div className="w-24"><Label>النجوم</Label>
              <Select value={form.rating} onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })}>
                {[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r} ★</option>)}
              </Select>
            </div>
          </div>
          <Button className="w-full" onClick={create} disabled={busy || !form.name.trim() || !form.text.trim()}>إضافة رأي</Button>
        </CardContent>
      </Card>

      {items.map((t) => (
        <Card key={t.id}>
          <CardContent className="py-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-extrabold">{t.name} <span className="text-amber-500">{"★".repeat(t.rating)}</span></p>
                {t.level && <p className="text-[11px] font-bold text-amber-700">{t.level}</p>}
                <p className="mt-1 text-sm text-gray-600">«{t.text}»</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Button size="sm" variant={t.published ? "secondary" : "success"} onClick={() => togglePublish(t)} disabled={busy}>
                  {t.published ? "منشور ✓" : "نشر"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => remove(t.id)} disabled={busy}>حذف</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      {items.length === 0 && <Card><CardContent className="text-center py-6 text-gray-500">لا آراء بعد</CardContent></Card>}
    </div>
  );
}
