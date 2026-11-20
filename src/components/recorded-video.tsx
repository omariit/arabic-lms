"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Protected playback of a lesson recording (server-produced MP4).
 *
 * Same expectations as the YouTube wrapper: streaming comes from an authorised
 * app route (`/api/recordings/:id/video`, Range-enabled), the student's name and
 * phone drift across the picture, and download/context-menu shortcuts are off.
 * The MP4 URL itself is never a public link — it needs her session.
 */
export function RecordedVideo({
  recordingId,
  title,
  studentName,
  studentPhone,
  poster,
}: {
  recordingId: string;
  title: string;
  studentName: string;
  studentPhone: string;
  poster?: string | null;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [pos, setPos] = useState({ top: 12, left: 42 });
  const [failed, setFailed] = useState(false);

  // Drift the watermark so a screen recording cannot crop it out.
  useEffect(() => {
    const t = setInterval(() => {
      setPos({ top: 8 + Math.random() * 72, left: 6 + Math.random() * 55 });
    }, 8000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-brand-100 bg-black shadow-sm">
      {failed ? (
        <div className="flex aspect-video items-center justify-center px-6 text-center text-sm text-white/80">
          تعذّر تشغيل تسجيل هذه الحصة الآن — أعيدي تحميل الصفحة أو أخبري المعلمة.
        </div>
      ) : (
        <video
          ref={ref}
          src={`/api/recordings/${recordingId}/video`}
          poster={poster ?? undefined}
          controls
          playsInline
          preload="metadata"
          controlsList="nodownload noplaybackrate"
          disablePictureInPicture
          onContextMenu={(e) => e.preventDefault()}
          onError={() => setFailed(true)}
          className="aspect-video w-full bg-black"
        >
          متصفحك لا يدعم تشغيل الفيديو.
        </video>
      )}

      <div
        aria-hidden
        className="pointer-events-none absolute select-none rounded bg-black/25 px-2 py-1 text-[10px] font-bold text-white/75 transition-all duration-1000"
        style={{ top: `${pos.top}%`, left: `${pos.left}%` }}
        dir="ltr"
      >
        {studentName} · {studentPhone}
      </div>

      <p className="pointer-events-none absolute bottom-14 right-3 rounded bg-black/40 px-2 py-1 text-[10px] text-white/70">
        🎥 {title} — محمي باسمك
      </p>
    </div>
  );
}
