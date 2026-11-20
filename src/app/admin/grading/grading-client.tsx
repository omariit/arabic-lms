"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/primitives";
import { uploadToR2 } from "@/lib/upload-client";

/** Mobile voice grading queue: listen (presigned GET), grade, text note, record voice feedback. */
export function GradingClient() {
  const [queue, setQueue] = useState<Array<{
    id: string; user: { id: string; fullName: string; phone: string }; exam: { title: string; maxGrade: number };
    audioFiles: Array<{ id: string }>; manualGrade?: number | null; feedbackText?: string | null;
  }>>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [grade, setGrade] = useState("");
  const [note, setNote] = useState("");
  const [recording, setRecording] = useState<"idle" | "recording" | "done">("idle");
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [mimeType, setMimeType] = useState("audio/webm");

  const load = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/grading");
      const data = await res.json();
      setQueue(data.queue ?? []);
      setLoaded(true);
    } finally { setBusy(false); }
  };

  const openItem = async (id: string) => {
    setOpenId(id);
    setPlayUrl(null);
    const item = queue.find((q) => q.id === id);
    setGrade(String(item?.manualGrade ?? ""));
    setNote(item?.feedbackText ?? "");
    if (item?.audioFiles.length) {
      const res = await fetch(`/api/r2/audio/${item.audioFiles[0].id}`);
      const data = await res.json();
      if (res.ok) setPlayUrl(data.url);
    }
  };

  const startRecording = async () => {
    const types = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
    const mt = types.find((t) => "MediaRecorder" in window && MediaRecorder.isTypeSupported(t)) ?? "audio/webm";
    setMimeType(mt.split(";")[0]);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, { mimeType: mt });
      mediaRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => setRecording("done");
      rec.start();
      setRecording("recording");
    } catch { /* mic denied */ }
  };

  const stopRecording = () => {
    mediaRef.current?.stop();
    mediaRef.current?.stream.getTracks().forEach((t) => t.stop());
  };

  const saveGrade = async (attemptId: string, maxGrade: number, studentId: string) => {
    setBusy(true);
    try {
      const hasRecording = recording === "done" && chunksRef.current.length > 0;
      const body: Record<string, unknown> = {
        attemptId,
        manualGrade: Math.min(maxGrade, Math.max(0, Number(grade) || 0)),
        feedbackText: note,
      };

      // Voice feedback goes browser → R2 directly; only its key is posted below.
      if (hasRecording) {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const up = await uploadToR2(blob, { kind: "feedback", mimeType, forUser: studentId });
        body.voiceNoteKey = up.key;
      }

      const res = await fetch("/api/admin/grading", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOpenId(null);
      setRecording("idle");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "خطأ");
    } finally { setBusy(false); }
  };

  if (!loaded) {
    return <Button size="lg" className="w-full" onClick={load} disabled={busy}>{busy ? "…" : "عرض طابور التصحيح"}</Button>;
  }

  if (openId) {
    const item = queue.find((q) => q.id === openId);
    if (!item) return null;
    return (
      <Card>
        <CardContent className="space-y-4 pt-5">
          <div>
            <p className="font-extrabold">{item.user.fullName}</p>
            <p className="text-xs text-gray-500">{item.exam.title} • {item.exam.maxGrade} درجة كحد أقصى</p>
          </div>

          {playUrl ? (
            <audio controls src={playUrl} className="w-full" />
          ) : (
            <p className="text-sm text-gray-400">جارٍ تجهيز الصوت…</p>
          )}

          <div>
            <label className="mb-1 block text-sm font-bold">الدرجة (من {item.exam.maxGrade})</label>
            <input type="number" min={0} max={item.exam.maxGrade} value={grade} onChange={(e) => setGrade(e.target.value)}
              className="h-12 w-full rounded-xl border border-brand-200 px-4 text-lg font-bold outline-none focus:border-brand-500" />
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold">ملاحظات نصية</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)}
              className="min-h-[80px] w-full rounded-xl border border-brand-200 p-3 text-sm outline-none focus:border-brand-500" />
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold">🎤 تعليق صوتي للطالبة</label>
            {recording === "idle" && <Button variant="secondary" className="w-full" onClick={startRecording}>تسجيل تعليق صوتي</Button>}
            {recording === "recording" && <Button variant="destructive" className="w-full" onClick={stopRecording}>إيقاف التسجيل 🔴</Button>}
            {recording === "done" && (
              <p className="rounded-lg bg-emerald-50 p-3 text-center text-sm font-bold text-emerald-700">✓ التسليم مع الدرجة</p>
            )}
          </div>

          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => saveGrade(item.id, item.exam.maxGrade, item.user.id)} disabled={busy}>
              {busy ? "…" : "حفظ التصحيح"}
            </Button>
            <Button variant="outline" onClick={() => { setOpenId(null); setRecording("idle"); }}>إلغاء</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (queue.length === 0) {
    return <Card><CardContent className="text-center py-8 text-gray-500">لا توجد تسجيلات بانتظار التصحيح 🎉</CardContent></Card>;
  }

  return (
    <div className="space-y-3">
      {queue.map((q) => (
        <Card key={q.id}>
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <p className="font-bold">{q.user.fullName}</p>
              <p className="text-xs text-gray-500">{q.exam.title}</p>
            </div>
            <Button size="sm" onClick={() => openItem(q.id)}>تصحيح 🎤</Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
