"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent } from "@/components/ui/primitives";
import { formatSeconds } from "@/lib/utils";

type Rec = {
  id: string; title: string; status: string; stage: string; progress: number; chunkCount: number;
  durationSec: number | null; sizeBytes: number | null; hasVideo: boolean; error: string | null;
  lessonId: string | null; videoUrl: string | null; thumbnailUrl: string | null;
  startedAt: string; readyAt: string | null; updatedAt: string;
  courseTitle: string | null; lessonTitle: string | null; teacherName: string | null;
};

const STATUS: Record<string, { label: string; tone: "green" | "amber" | "red" | "brand" | "gray" }> = {
  READY: { label: "جاهز", tone: "green" },
  PROCESSING: { label: "قيد المعالجة", tone: "amber" },
  UPLOADING: { label: "يُرفع", tone: "amber" },
  RECORDING: { label: "تسجيل جارٍ", tone: "brand" },
  FAILED: { label: "فشل", tone: "red" },
  ABORTED: { label: "ملغى", tone: "gray" },
  EXPIRED: { label: "منتهي", tone: "gray" },
};

/** Admin/teacher view of every recording: health, progress, playback and recovery. */
export function RecordingsClient({ isAdmin }: { isAdmin: boolean }) {
  const [data, setData] = useState<{ configured: boolean; recordings: Rec[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [lessons, setLessons] = useState<Array<{ id: string; title: string }>>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/recordings");
      const json = await res.json().catch(() => null);
      if (!res.ok || !json) throw new Error(json?.error ?? `تعذّر التحميل (${res.status})`);
      setData({ configured: Boolean(json.configured), recordings: Array.isArray(json.recordings) ? json.recordings : [] });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر التحميل");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Auto-refresh while anything is still in flight.
  useEffect(() => {
    if (!data?.recordings.some((r) => ["RECORDING", "UPLOADING", "PROCESSING"].includes(r.status))) return;
    const t = setInterval(() => void load(), 4000);
    return () => clearInterval(t);
  }, [data, load]);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/courses").catch(() => null);
      const json = res && res.ok ? await res.json().catch(() => null) : null;
      const flat = (json?.courses ?? []).flatMap((c: { modules?: Array<{ lessons?: Array<{ id: string; title: string }> }> }) =>
        (c.modules ?? []).flatMap((m) => m.lessons ?? []),
      );
      setLessons(flat);
    })();
  }, []);

  const act = async (id: string, action: "finalize" | "abort" | "delete") => {
    if (action === "delete" && !window.confirm("حذف هذا التسجيل نهائيًا؟ لا يمكن التراجع.")) return;
    setBusy(id); setNotice("");
    try {
      const res = await fetch(`/api/admin/recordings/${id}${action === "delete" ? "" : `/${action}`}`, {
        method: action === "delete" ? "DELETE" : "POST",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "تعذّر تنفيذ الإجراء");
      setNotice(action === "delete" ? "✓ حُذف التسجيل" : action === "abort" ? "✓ أُلغي التسجيل" : "✓ بدأت المعالجة");
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "تعذّر تنفيذ الإجراء");
    } finally {
      setBusy(null);
    }
  };

  const attach = async (id: string, lessonId: string) => {
    setBusy(id); setNotice("");
    try {
      const res = await fetch(`/api/admin/recordings/${id}/attach`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lessonId: lessonId || null }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "تعذّر الربط");
      setNotice(lessonId ? "✓ رُبط الفيديو بالدرس" : "✓ أُلغي الربط");
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "تعذّر الربط");
    } finally {
      setBusy(null);
    }
  };

  if (!data) {
    return (
      <div className="space-y-3">
        <p className="rounded-xl bg-white p-4 text-center text-sm text-gray-500">جارٍ التحميل…</p>
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm font-bold text-red-600">{error}</p>}
        <Button className="w-full" onClick={load}>إعادة المحاولة</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!data.configured && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-900">
          خدمة التسجيل غير مفعّلة على هذا الخادم — راجعي <code>docs/recording.md</code>.
        </p>
      )}
      {notice && <p className="rounded-xl bg-brand-50 p-3 text-sm font-bold text-brand-800">{notice}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-extrabold text-brand-950">📼 تسجيلات الحصص {isAdmin && <span className="text-xs font-bold text-gray-400">(كل المعلمات)</span>}</h1>
        <div className="ms-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => void load()}>🔄 تحديث</Button>
          <Link href="/admin/studio"><Button size="sm">🎬 تسجيل جديد</Button></Link>
        </div>
      </div>

      {data.recordings.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 py-10 text-center text-sm text-gray-600">
            <p className="text-4xl">🎬</p>
            <p className="font-extrabold text-brand-950">لا تسجيلات بعد</p>
            <p>
              التسجيل يبدأ من <strong>استوديو التعليم</strong>: تختارين الدرس، تضغطين «بدء التسجيل»،
              وعند «إنهاء» يظهر الفيديو هنا ويُربط بالدرس تلقائيًا.
            </p>
            <p className="text-xs text-gray-500">
              سجّلتِ ولم يظهر شيء؟ اضغطي <strong>تحديث</strong> — التسجيل يحتاج بضع ثوانٍ بعد الإنهاء،
              وإن فشل يظهر هنا بحالة «فشل» مع السبب.
            </p>
            <div className="flex justify-center gap-2">
              <Link href="/admin/studio"><Button size="sm">فتح الاستوديو</Button></Link>
              <Button size="sm" variant="outline" onClick={() => void load()}>تحديث الآن</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        data.recordings.map((r) => {
          const status = STATUS[r.status] ?? { label: r.status, tone: "gray" as const };
          const inFlight = ["RECORDING", "UPLOADING", "PROCESSING"].includes(r.status);
          return (
            <Card key={r.id} className={r.status === "READY" ? "border-emerald-200" : undefined}>
              <CardContent className="space-y-3 py-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold text-brand-950">{r.title}</p>
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      {r.lessonTitle ? `📚 ${r.lessonTitle}` : "بدون ربط بدرس"}
                      {isAdmin && r.teacherName ? ` · 👩‍🏫 ${r.teacherName}` : ""}
                    </p>
                  </div>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </div>

                {r.hasVideo && r.thumbnailUrl && (
                  <a href={r.videoUrl ?? "#"} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.thumbnailUrl} alt={r.title} className="h-36 w-full object-cover" />
                  </a>
                )}

                {inFlight && (
                  <div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-brand-100">
                      <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${Math.max(3, r.progress)}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-brand-900/60">
                      {r.stage} — {r.progress}% · {r.chunkCount} مقطع
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 text-[11px] text-gray-500">
                  <span>{new Date(r.startedAt).toLocaleString("ar-JO")}</span>
                  {r.durationSec ? <span>· ⏱ {formatSeconds(r.durationSec)}</span> : null}
                  {r.sizeBytes ? <span>· {(r.sizeBytes / 1_048_576).toFixed(1)} م.ب</span> : null}
                </div>

                {r.error && <p className="rounded-lg bg-red-50 p-2 text-[11px] font-bold text-red-700">{r.error}</p>}

                <div className="flex flex-wrap gap-2">
                  {r.hasVideo && (
                    <a href={r.videoUrl ?? "#"} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline">▶ مشاهدة</Button>
                    </a>
                  )}
                  {r.hasVideo && (
                    <a href={r.videoUrl ?? "#"} download={`${r.title}.mp4`}>
                      <Button size="sm" variant="outline">⬇ تنزيل</Button>
                    </a>
                  )}
                  {inFlight && (
                    <Button size="sm" disabled={busy === r.id} onClick={() => act(r.id, "finalize")}>إنهاء واستخراج</Button>
                  )}
                  {["FAILED", "ABORTED", "UPLOADING", "RECORDING"].includes(r.status) && (
                    <Button size="sm" variant="secondary" disabled={busy === r.id} onClick={() => act(r.id, "abort")}>إلغاء</Button>
                  )}
                  <Button size="sm" variant="destructive" disabled={busy === r.id} onClick={() => act(r.id, "delete")}>حذف</Button>
                </div>

                {r.hasVideo && (
                  <div className="flex items-center gap-2">
                    <select
                      className="min-w-0 flex-1 rounded-xl border border-brand-100 bg-brand-50/50 px-2 py-1.5 text-xs"
                      value={r.lessonId ?? ""}
                      disabled={busy === r.id}
                      onChange={(e) => attach(r.id, e.target.value)}
                    >
                      <option value="">— بدون ربط —</option>
                      {lessons.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
                    </select>
                    <span className="text-[10px] text-gray-400">ربط بالدرس</span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
