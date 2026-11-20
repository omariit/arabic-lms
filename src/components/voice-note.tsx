"use client";

import { useRef, useState } from "react";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { uploadToR2, type UploadKind } from "@/lib/upload-client";

/** Record → upload browser-to-R2 → hand the key to the caller (no bytes through our API). */
export function VoiceNoteRecorder({
  kind, forUser, onReady, disabled, compact,
}: {
  kind: UploadKind;
  forUser?: string;
  onReady: (voice: { key: string; mime: string } | null) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const rec = useAudioRecorder(180);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const previewRef = useRef<HTMLAudioElement | null>(null);

  const stop = () => rec.stop();

  const confirm = async () => {
    if (!rec.blob) return;
    setBusy(true);
    setError("");
    try {
      const up = await uploadToR2(rec.blob, { kind, mimeType: rec.mimeType, forUser });
      onReady({ key: up.key, mime: up.mimeType });
      rec.reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر رفع التسجيل");
    } finally {
      setBusy(false);
    }
  };

  const preview = () => {
    if (!rec.blob) return;
    if (!previewRef.current) previewRef.current = new Audio();
    previewRef.current.src = URL.createObjectURL(rec.blob);
    void previewRef.current.play();
  };

  if (rec.state === "recording") {
    return (
      <button
        type="button"
        onClick={stop}
        className="rounded-xl bg-red-600 px-3 py-2 text-xs font-extrabold text-white"
      >
        ⏹ إيقاف ({rec.seconds}s)
      </button>
    );
  }

  if (rec.blob) {
    return (
      <span className="flex items-center gap-1">
        <button type="button" onClick={preview} className="rounded-xl border border-brand-200 px-2 py-1.5 text-[11px] font-bold">▶</button>
        <button type="button" onClick={confirm} disabled={busy} className="rounded-xl bg-brand-700 px-2.5 py-1.5 text-[11px] font-extrabold text-white disabled:opacity-50">
          {busy ? "…" : "إرفاق الصوت ✓"}
        </button>
        <button type="button" onClick={rec.reset} className="rounded-xl border border-brand-200 px-2 py-1.5 text-[11px]">🗑</button>
      </span>
    );
  }

  return (
    <span className="flex flex-col items-end">
      <button
        type="button"
        onClick={rec.start}
        disabled={disabled}
        title="تسجيل رسالة صوتية"
        className={`rounded-xl border border-brand-200 text-brand-800 disabled:opacity-40 ${compact ? "px-2.5 py-1.5 text-sm" : "px-3 py-2 text-xs font-bold"}`}
      >
        🎙
      </button>
      {error && <span className="mt-1 text-[10px] font-bold text-red-600">{error}</span>}
    </span>
  );
}

/** Lazily resolves a presigned URL and plays the note inline. */
export function VoiceNotePlayer({ messageId, endpoint, mine }: {
  messageId: string;
  endpoint: string;
  mine?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);

  const play = async () => {
    if (audio.current && !audio.current.paused) {
      audio.current.pause();
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (!url) {
        const res = await fetch(endpoint.replace("{id}", messageId));
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? "تعذّر التشغيل");
        setUrl(j.url);
        if (!audio.current) audio.current = new Audio();
        audio.current.src = j.url;
      }
      await audio.current!.play();
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="mt-1 flex items-center gap-1.5">
      <button
        type="button"
        onClick={play}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-extrabold ${mine ? "bg-white/25 text-white" : "bg-brand-100 text-brand-900"}`}
      >
        {busy ? "…" : "🎙 تشغيل الرسالة الصوتية"}
      </button>
      {error && <span className="text-[10px] font-bold text-red-500">{error}</span>}
    </span>
  );
}
