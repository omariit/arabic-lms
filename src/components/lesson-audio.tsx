"use client";

import { useEffect, useRef, useState } from "react";
import { uploadToR2 } from "@/lib/upload-client";
import { Button } from "@/components/ui/button";

/** Teacher recording attached to a lesson: shown to enrolled students above the video. */
export function LessonAudioPlayer({ lessonId, title }: { lessonId: string; title: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/lessons/${lessonId}/audio`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "تعذّر تجهيز التسجيل");
        if (alive) setUrl(j.url);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "خطأ"));
    return () => {
      alive = false;
      audioRef.current?.pause();
    };
  }, [lessonId]);

  return (
    <div className="mb-4 rounded-2xl border border-brand-100 bg-white p-3">
      <p className="mb-2 text-sm font-extrabold text-brand-900">🎙️ تسجيل المعلمة لـ {title}</p>
      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : !url ? (
        <p className="text-xs text-gray-400">جارٍ التحميل…</p>
      ) : (
        <audio ref={audioRef} controls src={url} className="w-full" />
      )}
    </div>
  );
}

/** Builder-side control: record the lesson recitation and store its R2 key on the lesson. */
export function LessonAudioUploader({ lessonId, hasAudio, onChange }: {
  lessonId: string;
  hasAudio: boolean;
  onChange: (has: boolean) => void;
}) {
  const [state, setState] = useState<"idle" | "recording" | "uploading">("idle");
  const [msg, setMsg] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const start = async () => {
    setMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
      const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t)) ?? "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType });
      chunks.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: mimeType });
        if (!blob.size) { setState("idle"); return; }
        setState("uploading");
        try {
          const up = await uploadToR2(blob, { kind: "lesson", mimeType });
          const res = await fetch(`/api/admin/lessons/${lessonId}`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audioKey: up.key }),
          });
          const j = await res.json();
          if (!res.ok) throw new Error(j.error ?? "فشل حفظ التسجيل");
          setMsg("تم حفظ تسجيل الدرس ✓");
          onChange(true);
        } catch (e) {
          setMsg(e instanceof Error ? e.message : "خطأ");
        } finally { setState("idle"); }
      };
      mr.start();
      recorder.current = mr;
      setState("recording");
    } catch {
      setMsg("تعذّر الوصول إلى الميكروفون");
    }
  };

  const stop = () => recorder.current?.stop();

  const remove = async () => {
    setState("uploading");
    try {
      const res = await fetch(`/api/admin/lessons/${lessonId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearAudio: true }),
      });
      if (!res.ok) throw new Error("تعذّر حذف التسجيل");
      setMsg("تم حذف التسجيل");
      onChange(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "خطأ");
    } finally { setState("idle"); }
  };

  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-3">
      <p className="mb-2 text-xs font-bold text-brand-900">🎙️ تسجيل صوتي للدرس (تسميع/شرح)</p>
      <div className="flex flex-wrap items-center gap-2">
        {state === "recording" ? (
          <Button type="button" size="sm" variant="secondary" onClick={stop}>⏹ إيقاف ورفع</Button>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={start} disabled={state === "uploading"}>
            ● {hasAudio ? "إعادة التسجيل" : "بدء التسجيل"}
          </Button>
        )}
        {hasAudio && state !== "recording" && (
          <Button type="button" size="sm" variant="ghost" onClick={remove} disabled={state === "uploading"}>🗑 حذف</Button>
        )}
        {state === "uploading" && <span className="text-xs text-gray-500">جارٍ الرفع إلى R2…</span>}
        {state === "recording" && <span className="text-xs font-bold text-red-600">● جارٍ التسجيل…</span>}
      </div>
      {msg && <p className="mt-2 text-xs text-brand-700">{msg}</p>}
      <p className="mt-2 text-[11px] text-gray-500">الصوت يُرفع من جهازك مباشرة إلى التخزين، ولا يمرّ عبر الخادم.</p>
    </div>
  );
}
