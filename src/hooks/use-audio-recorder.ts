"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Cross-browser audio recording hook (iOS Safari + Android/Desktop Chrome).
 * Picks the first supported container: audio/webm;codecs=opus for Chrome/Android,
 * falls back to audio/mp4 (AAC) on iOS Safari, then audio/ogg for Firefox.
 * Enforces a max duration with progress, preview playback, and re-record.
 */

export type RecorderState = "idle" | "recording" | "paused" | "recorded" | "error";

export function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4", // iOS Safari records AAC into mp4
    "audio/aac",
    "audio/ogg;codecs=opus",
  ];
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

export function mimeToFileExtension(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4") || mime.includes("aac")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "audio";
}

export function useAudioRecorder(maxSeconds = 180) {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [mimeType, setMimeType] = useState<string>("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("المتصفح لا يدعم التسجيل الصوتي");
      if (typeof MediaRecorder === "undefined") throw new Error("المتصفح لا يدعم MediaRecorder");
      const mt = pickMimeType();
      if (!mt) throw new Error("لا يوجد صيغة تسجيل مدعومة في هذا المتصفح");

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      setMimeType(mt);

      const rec = new MediaRecorder(stream, { mimeType: mt, audioBitsPerSecond: 96000 });
      mediaRecorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const final = new Blob(chunksRef.current, { type: mt });
        setBlob(final);
        setState("recorded");
        releaseStream();
      };
      rec.start(250);
      setSeconds(0);
      setState("recording");

      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          const next = s + 1;
          if (next >= maxSeconds) {
            // Auto-stop at the max duration limit.
            try { mediaRecorderRef.current?.stop(); } catch { /* noop */ }
            stopTimer();
          }
          return next;
        });
      }, 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر بدء التسجيل (تأكد من إذن الميكروفون)");
      setState("error");
      releaseStream();
    }
  }, [maxSeconds, releaseStream, stopTimer]);

  const stop = useCallback(() => {
    stopTimer();
    try { mediaRecorderRef.current?.stop(); } catch { /* noop */ }
  }, [stopTimer]);

  const reset = useCallback(() => {
    stopTimer();
    releaseStream();
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setBlob(null);
    setSeconds(0);
    setState("idle");
    setError(null);
  }, [releaseStream, stopTimer]);

  // Cleanup on unmount.
  useEffect(() => () => {
    stopTimer();
    releaseStream();
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, [releaseStream, stopTimer]);

  const previewUrl = blob ? URL.createObjectURL(blob) : null;

  return {
    state, error, seconds, maxSeconds, blob, mimeType, previewUrl,
    start, stop, reset,
    progress: Math.min(100, (seconds / maxSeconds) * 100),
  };
}
