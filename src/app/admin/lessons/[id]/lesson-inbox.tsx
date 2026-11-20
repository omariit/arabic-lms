"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { uploadToR2 } from "@/lib/upload-client";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/primitives";

type Lesson = {
  id: string; title: string; description: string; scriptText: string;
  assignmentTitle: string; assignmentInstructions: string; courseTitle: string; courseId: string;
};
type Thread = { id: string; studentId: string; studentName: string; studentPhone: string; staffUnread: number; preview: string; hasVoice: boolean; previewRole: string | null; lastMessageAt: string };
type Msg = { id: string; senderId: string; senderRole: string; body: string; audioKey?: string | null; audioMime?: string | null; createdAt: string };

const btn = "rounded-xl px-3 py-2 text-xs font-extrabold transition disabled:opacity-50";

export function LessonInbox({ lesson }: { lesson: Lesson }) {
  const [tab, setTab] = useState<"assignment" | "inbox">("assignment");
  const [form, setForm] = useState({ description: lesson.description, scriptText: lesson.scriptText, assignmentTitle: lesson.assignmentTitle, assignmentInstructions: lesson.assignmentInstructions });
  const [saved, setSaved] = useState(false);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [active, setActive] = useState<string | null>(null); // studentId
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const rec = useAudioRecorder(180);
  const [sending, setSending] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async () => {
    const res = await fetch(`/api/admin/lessons/${lesson.id}/threads`);
    if (!res.ok) return;
    const j = await res.json();
    setThreads(j.threads ?? []);
  }, [lesson.id]);

  const loadMessages = useCallback(async (studentId: string) => {
    const res = await fetch(`/api/admin/lessons/${lesson.id}/threads/${studentId}`);
    if (!res.ok) return;
    const j = await res.json();
    setMessages(j.messages ?? []);
  }, [lesson.id]);

  useEffect(() => { loadThreads(); }, [loadThreads]);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => loadMessages(active), 5000);
    return () => clearInterval(t);
  }, [active, loadMessages]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  const saveAssignment = async () => {
    const res = await fetch(`/api/admin/lessons/${lesson.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); }
  };

  const play = async (m: Msg) => {
    if (!m.audioKey) return;
    if (playingId === m.id) { audioRef.current?.pause(); setPlayingId(null); return; }
    const res = await fetch(`/api/lessons/audio/${m.id}`);
    if (!res.ok) return;
    const j = await res.json();
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = j.url;
    audioRef.current.onended = () => setPlayingId(null);
    await audioRef.current.play();
    setPlayingId(m.id);
  };

  const reply = async () => {
    const text = draft.trim();
    if (!text && !rec.blob) return;
    setSending(true);
    try {
      let voice: { key: string; mime: string } | null = null;
      if (rec.blob) {
        const up = await uploadToR2(rec.blob, { kind: "feedback", mimeType: rec.mimeType, forUser: active ?? undefined });
        voice = { key: up.key, mime: up.mimeType };
      }
      const res = await fetch(`/api/admin/lessons/${lesson.id}/threads/${active}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, audioKey: voice?.key, audioMime: voice?.mime }),
      });
      if (!res.ok) throw new Error("خطأ");
      setDraft("");
      rec.reset();
      await Promise.all([loadMessages(active!), loadThreads()]);
    } catch { /* ignore */ } finally { setSending(false); }
  };

  const totalUnread = threads.reduce((n, t) => n + t.staffUnread, 0);

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-brand-100 bg-white p-5 shadow-sm">
        <p className="text-xs text-brand-900/50">📖 {lesson.courseTitle}</p>
        <h1 className="mt-1 text-lg font-extrabold text-brand-950">🎬 {lesson.title}</h1>
        <div className="mt-3 flex gap-2">
          <button onClick={() => setTab("assignment")} className={`${btn} ${tab === "assignment" ? "bg-brand-700 text-white" : "border border-brand-200 bg-white text-brand-900"}`}>
            ✏️ محتوى الدرس والواجب
          </button>
          <button onClick={() => setTab("inbox")} className={`${btn} ${tab === "inbox" ? "bg-brand-700 text-white" : "border border-brand-200 bg-white text-brand-900"}`}>
            📥 صندوق الواجبات {totalUnread > 0 && <span className="ml-1 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-extrabold text-emerald-950">{totalUnread}</span>}
          </button>
        </div>
      </div>

      {tab === "assignment" && (
        <div className="space-y-3 rounded-3xl border border-brand-100 bg-white p-5 shadow-sm">
          <div>
            <Label>🎬 وصف المحاضرة (يظهر تحت الفيديو)</Label>
            <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <Label>📜 السكريبت / النص الكامل (تقرأه الطالبة مع الدرس)</Label>
            <Textarea rows={6} value={form.scriptText} onChange={(e) => setForm({ ...form, scriptText: e.target.value })} />
          </div>
          <div>
            <Label>📝 عنوان الواجب (اتركيه فارغًا إن لم يوجد واجب)</Label>
            <Input value={form.assignmentTitle} onChange={(e) => setForm({ ...form, assignmentTitle: e.target.value })} placeholder="مثال: سجّلي تلاوة الآيات ١-٥" />
          </div>
          <div>
            <Label>📋 تعليمات الواجب</Label>
            <Textarea rows={4} value={form.assignmentInstructions} onChange={(e) => setForm({ ...form, assignmentInstructions: e.target.value })} />
          </div>
          <Button onClick={saveAssignment}>{saved ? "تم الحفظ ✓" : "حفظ التغييرات"}</Button>
        </div>
      )}

      {tab === "inbox" && !active && (
        <div>
          {threads.length === 0 ? (
            <p className="rounded-3xl bg-white p-8 text-center text-sm text-brand-900/60 shadow-sm">لا توجد تسليمات بعد — ستظهر هنا تلقائيًا مع أول تسليم</p>
          ) : (
            threads.map((t) => (
              <button key={t.id} onClick={() => { setActive(t.studentId); loadMessages(t.studentId); }} className="mb-2 w-full rounded-3xl border border-brand-100 bg-white p-4 text-right shadow-sm transition hover:border-brand-300">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-extrabold text-brand-950">{t.studentName}</p>
                  {t.staffUnread > 0 && <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-extrabold text-emerald-950">{t.staffUnread}</span>}
                </div>
                <p className="mt-1 line-clamp-1 text-xs text-brand-900/60">{t.previewRole !== "STUDENT" ? "↩ " : ""}{t.preview} {t.hasVoice ? "🎙" : ""}</p>
              </button>
            ))
          )}
        </div>
      )}

      {tab === "inbox" && active && (
        <div className="flex flex-col rounded-3xl border border-brand-100 bg-white shadow-sm" style={{ height: "70dvh" }}>
          <div className="flex items-center justify-between border-b border-brand-100 p-3">
            <p className="text-sm font-extrabold text-brand-950">{threads.find((t) => t.studentId === active)?.studentName}</p>
            <button onClick={() => { setActive(null); loadThreads(); }} className="rounded-xl border border-brand-200 px-3 py-1.5 text-xs font-bold text-brand-900">← الصندوق</button>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-4">
            {messages.map((m) => {
              const mine = m.senderRole !== "STUDENT";
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-6 shadow-sm ${mine ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-950"}`}>
                    {m.body && <p className="whitespace-pre-line">{m.body}</p>}
                    {m.audioKey && (
                      <button onClick={() => play(m)} className="mt-1 flex items-center gap-2 rounded-full bg-white/20 px-3 py-1.5 text-xs font-extrabold">
                        {playingId === m.id ? "⏸ إيقاف" : "▶ استمعي"} 🎙
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={bottom} />
          </div>
          <div className="space-y-2 border-t border-brand-100 p-3">
            <textarea rows={2} className="w-full rounded-xl border border-brand-100 bg-brand-50/50 px-3 py-2 text-sm outline-none focus:border-brand-400" placeholder="اكتبي تصحيحك أو ملاحظتك…" value={draft} onChange={(e) => setDraft(e.target.value)} />
            <div className="flex items-center gap-2">
              <Button onClick={reply} disabled={sending || (!draft.trim() && !rec.blob)} className="flex-1">{sending ? "…" : "إرسال التصحيح"}</Button>
              {rec.state === "recording" ? (
                <Button variant="destructive" onClick={rec.stop}>⏹ ({rec.seconds}s)</Button>
              ) : rec.blob ? (
                <Button variant="outline" onClick={rec.reset}>🎙 جاهز 🗑</Button>
              ) : (
                <Button variant="outline" onClick={rec.start}>🎙 تصحيح صوتي</Button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="text-center">
        <Link href={`/admin/courses/${lesson.courseId}`} className="text-xs font-bold text-brand-600 underline">← عودة إلى بناء الدورة</Link>
      </div>
    </div>
  );
}
