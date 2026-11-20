"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { uploadToR2 } from "@/lib/upload-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";

/** Course cover artwork: picked from the device, uploaded browser → R2, then a tiny key is saved. */
export function CoverUploader({ courseId, hasCover, onChange }: {
  courseId: string;
  hasCover: boolean;
  onChange: () => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const loadPreview = useCallback(async () => {
    const res = await fetch(`/api/admin/courses/${courseId}`);
    if (!res.ok) return;
    const j = await res.json();
    setPreview(j.coverUrl ?? null);
  }, [courseId]);

  useEffect(() => { loadPreview(); }, [loadPreview, hasCover]);

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setMsg("");
    try {
      const up = await uploadToR2(file, { kind: "cover", mimeType: file.type, filename: file.name });
      const res = await fetch(`/api/admin/courses/${courseId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverImageKey: up.key }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "تعذّر حفظ الغلاف");
      setMsg("تم حفظ الغلاف ✓");
      await loadPreview();
      onChange();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "خطأ");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await fetch(`/api/admin/courses/${courseId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearCover: true }),
      });
      setPreview(null);
      setMsg("تم حذف الغلاف");
      onChange();
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl bg-brand-50/60 p-3">
      <p className="text-xs font-extrabold text-brand-900">🖼️ صورة غلاف الدورة</p>
      {preview ? (
        <div className="mt-2 flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="غلاف الدورة" className="h-16 w-28 rounded-lg object-cover" />
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>تغيير</Button>
          <Button size="sm" variant="ghost" onClick={remove} disabled={busy}>🗑</Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" className="mt-2" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? "…" : "＋ رفع صورة الغلاف"}
        </Button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0])}
      />
      <p className="mt-1 text-[10px] text-brand-900/55">تُرفع من جهازك مباشرة إلى التخزين (حتى 5 ميجا).</p>
      {msg && <p className="mt-1 text-[11px] font-bold text-brand-700">{msg}</p>}
    </div>
  );
}

type Resource = { id: string; title: string; mimeType: string; size: number };

/** Downloadable lesson material (PDF / mushaf image / audio), stored privately in R2. */
export function LessonResources({ lessonId }: { lessonId: string }) {
  const [items, setItems] = useState<Resource[]>([]);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/lessons/${lessonId}/resources`);
    if (res.ok) setItems((await res.json()).resources ?? []);
  }, [lessonId]);

  useEffect(() => { load(); }, [load]);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setMsg("");
    try {
      const up = await uploadToR2(file, { kind: "resource", mimeType: file.type, filename: file.name });
      const res = await fetch(`/api/admin/lessons/${lessonId}/resources`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() || file.name, fileKey: up.key, mimeType: file.type }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "تعذّر إضافة الملف");
      setTitle("");
      setMsg("تمت الإضافة ✓");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "خطأ");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await fetch(`/api/admin/lessons/${lessonId}/resources?resourceId=${id}`, { method: "DELETE" });
      await load();
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-3">
      <p className="text-xs font-extrabold text-brand-900">📎 مرفقات الدرس (PDF · صورة مصحف · تسجيل)</p>
      {items.length > 0 && (
        <ul className="mt-2 space-y-1">
          {items.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5">
              <span className="min-w-0 truncate text-[11px] font-bold text-brand-900">
                {r.mimeType.startsWith("image/") ? "🖼️" : r.mimeType.startsWith("audio/") ? "🎧" : "📄"} {r.title}
                <span className="ms-1 text-[10px] text-brand-900/45">{Math.round(r.size / 1024)} ك.ب</span>
              </span>
              <button onClick={() => remove(r.id)} className="rounded-lg border border-red-200 px-2 py-0.5 text-[10px] font-bold text-red-600" disabled={busy}>حذف</button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex gap-1.5">
        <Input placeholder="اسم الملف (اختياري)" value={title} onChange={(e) => setTitle(e.target.value)} className="min-w-0 flex-1 text-xs" />
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? "…" : "＋ ملف"}
        </Button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,image/*,audio/*,.doc,.docx"
        className="hidden"
        onChange={(e) => upload(e.target.files?.[0])}
      />
      {msg && <p className="mt-1 text-[11px] font-bold text-brand-700">{msg}</p>}
    </div>
  );
}

/** Student-facing list of a lesson's attachments. */
export function LessonResourcesView({ lessonId, items }: {
  lessonId: string;
  items: Array<{ id: string; title: string; mimeType: string; size: number }>;
}) {
  if (items.length === 0) return null;
  const open = async (id: string) => {
    const res = await fetch(`/api/lessons/${lessonId}/resources/${id}`);
    const j = await res.json();
    if (res.ok && j.url) window.open(j.url, "_blank", "noopener");
  };
  return (
    <div className="mt-3 rounded-2xl border border-brand-100 bg-white p-3">
      <p className="mb-2 text-xs font-extrabold text-brand-900">📎 مرفقات الدرس</p>
      <div className="flex flex-wrap gap-2">
        {items.map((r) => (
          <button
            key={r.id}
            onClick={() => open(r.id)}
            className="flex items-center gap-1.5 rounded-xl border border-brand-200 px-2.5 py-1.5 text-[11px] font-bold text-brand-900"
          >
            {r.mimeType.startsWith("image/") ? "🖼️" : r.mimeType.startsWith("audio/") ? "🎧" : "📄"} {r.title}
          </button>
        ))}
      </div>
    </div>
  );
}
