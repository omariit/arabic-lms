"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { uploadToR2 } from "@/lib/upload-client";
import { Button } from "@/components/ui/button";

type Msg = { id: string; senderId: string; senderRole: string; body: string; audioKey?: string | null; audioMime?: string | null; createdAt: string };
type Assignment = { title: string; instructions: string } | null;

const ROLE_LABEL: Record<string, string> = {
  TEACHER: "المعلمة", ADMIN: "الإدارة", ASSISTANT: "مساعدة المعلمة", STUDENT: "أنتِ",
};

/**
 * Lesson workspace (student side): assignment submission (text + voice)
 * and the PRIVATE thread with the teacher's team attached to this lesson.
 * Each student sees only her own thread — a private-tutoring feel per lesson.
 */
export function LessonWorkspace({ lessonId, initialAssignment }: { lessonId: string; initialAssignment: Assignment }) {
  const [tab, setTab] = useState<"content" | "workspace">("content");
  const [assignment, setAssignment] = useState<Assignment>(initialAssignment);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const rec = useAudioRecorder(180);
  const bottom = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/lessons/${lessonId}/thread`);
    if (!res.ok) return;
    const j = await res.json();
    setAssignment(j.assignment);
    setMessages(j.messages ?? []);
  }, [lessonId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  const play = async (msg: Msg) => {
    if (playingId === msg.id) { audioRef.current?.pause(); setPlayingId(null); return; }
    const res = await fetch(`/api/lessons/audio/${msg.id}`);
    if (!res.ok) { setNote("تعذّر تشغيل التسجيل"); return; }
    const j = await res.json();
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = j.url;
    audioRef.current.onended = () => setPlayingId(null);
    await audioRef.current.play();
    setPlayingId(msg.id);
  };

  const uploadVoice = async (): Promise<{ key: string; mime: string } | null> => {
    if (!rec.blob) return null;
    const up = await uploadToR2(rec.blob, { kind: "submission", mimeType: rec.mimeType });
    return { key: up.key, mime: up.mimeType };
  };

  const previewUrl = useRef<string | null>(null);
  const playPreview = () => {
    if (!rec.blob) return;
    if (!audioRef.current) audioRef.current = new Audio();
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = URL.createObjectURL(rec.blob);
    audioRef.current.src = previewUrl.current;
    audioRef.current.onended = () => setPlayingId(null);
    void audioRef.current.play();
  };

  const send = async () => {
    const text = draft.trim();
    if (!text && !rec.blob) return;
    setSending(true);
    setNote(null);
    try {
      let voice: { key: string; mime: string } | null = null;
      if (rec.blob) voice = await uploadVoice();
      const res = await fetch(`/api/lessons/${lessonId}/thread`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, audioKey: voice?.key, audioMime: voice?.mime }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "خطأ");
      setDraft("");
      rec.reset();
      setNote("تم الإرسال ✓ بانتظار رد المعلمة");
      await load();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "خطأ");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-6">
      {/* tabs */}
      <div className="mb-4 flex gap-2">
        {([["content", "📖 محتوى الدرس"], ["workspace", assignment ? "📝 الواجب والمحادثة" : "💬 محادثتي مع المعلمة"]] as const).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-xl px-4 py-2.5 text-sm font-extrabold transition ${tab === k ? "bg-brand-700 text-white shadow" : "border border-brand-200 bg-white text-brand-900"}`}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === "content" && (
        <div className="space-y-4 text-sm leading-8 text-emerald-950/85">
          {assignment && (
            <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
              <p className="text-sm font-extrabold text-emerald-950">📝 {assignment.title}</p>
              <p className="mt-1 whitespace-pre-line text-xs leading-6 text-emerald-900/80">{assignment.instructions}</p>
              <button onClick={() => setTab("workspace")} className="mt-2 text-xs font-extrabold text-brand-700 underline">
                اكتبي أو سجّلي تسليمك هنا ←
              </button>
            </div>
          )}
        </div>
      )}

      {tab === "workspace" && (
        <div className="flex flex-col rounded-3xl border border-brand-100 bg-white shadow-sm" style={{ height: "70dvh" }}>
          <div className="border-b border-brand-100 p-3">
            <p className="text-sm font-extrabold text-brand-950">
              {assignment ? `📝 ${assignment.title}` : "💬 محادثتي مع المعلمة"}
            </p>
            <p className="text-[11px] text-brand-900/50">محادثة خاصة بينكِ وبين المعلمة — خاصة بهذا الدرس</p>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto p-4">
            {assignment && messages.length === 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-emerald-900/80">
                <p className="font-extrabold text-emerald-950">📝 {assignment.title}</p>
                <p className="mt-1 whitespace-pre-line">{assignment.instructions}</p>
              </div>
            )}
            {messages.map((m) => {
              const mine = m.senderRole === "STUDENT";
              return (
                <div key={m.id} className={`flex ${mine ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-6 shadow-sm ${mine ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-950"}`}>
                    <p className="mb-0.5 text-[10px] font-extrabold opacity-70">{mine ? "أنتِ" : ROLE_LABEL[m.senderRole]}</p>
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

          {note && <p className="px-4 pb-1 text-[11px] font-bold text-brand-700">{note}</p>}

          <div className="space-y-2 border-t border-brand-100 p-3">
            <textarea
              rows={2}
              className="w-full rounded-xl border border-brand-100 bg-brand-50/50 px-3 py-2 text-sm outline-none focus:border-brand-400"
              placeholder="اكتبي إجابتك أو سؤالك…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <Button onClick={send} disabled={sending || (!draft.trim() && !rec.blob)} className="flex-1">
                {sending ? "…" : "إرسال"}
              </Button>
              {rec.state === "recording" ? (
                <Button variant="destructive" onClick={rec.stop}>⏹ إيقاف ({rec.seconds}s)</Button>
              ) : rec.blob ? (
                <>
                  <Button variant="outline" onClick={playPreview}>▶ سمعِ التسجيل</Button>
                  <Button variant="outline" onClick={rec.reset}>🗑</Button>
                </>
              ) : (
                <Button variant="outline" onClick={rec.start}>🎙 تسجيل صوتي</Button>
              )}
            </div>
          </div>
        </div>
      )}
      <audio ref={audioRef} className="hidden" />
    </div>
  );
}
