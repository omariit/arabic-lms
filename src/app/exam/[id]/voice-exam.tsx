"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Progress } from "@/components/ui/primitives";
import { mimeToFileExtension, useAudioRecorder } from "@/hooks/use-audio-recorder";

/**
 * Voice exam: cross-browser recording (webm/opus on Chrome/Android, mp4/AAC on
 * iOS Safari), max duration + progress, preview playback, re-record, then
 * browser -> R2 direct upload with a presigned PUT, then submission registration.
 */
export function VoiceExam({ examId, title, durationMin }: { examId: string; title: string; durationMin: number }) {
  const maxSeconds = Math.max(30, durationMin * 60);
  const rec = useAudioRecorder(maxSeconds);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async () => {
    if (!rec.blob) return;
    setUploading(true);
    setMsg(null);
    try {
      // 1. Presigned PUT (server validates enrollment + mime).
      const presignRes = await fetch("/api/r2/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "submission", mimeType: rec.mimeType }),
      });
      const presign = await presignRes.json();
      if (!presignRes.ok) throw new Error(presign.error ?? "تعذّر تجهيز الرفع");

      // 2. Direct browser -> R2 upload (no Railway bandwidth).
      const ext = mimeToFileExtension(rec.mimeType);
      const uploadRes = await fetch(presign.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": presign.contentType },
        body: rec.blob,
      });
      if (!uploadRes.ok) throw new Error("فشل رفع الملف إلى التخزين");

      // 3. Register the submission server-side.
      const subRes = await fetch("/api/exams/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId, key: presign.key, mimeType: presign.contentType }),
      });
      const sub = await subRes.json();
      if (!subRes.ok) throw new Error(sub.error ?? "تعذّر تسجيل الإرسال");

      setMsg({ ok: true, text: "تم إرسال تسجيلك بنجاح ✓ بانتظار تصحيح المعلمة" });
      rec.reset();
      window.location.reload();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "خطأ" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent>
          <h1 className="text-lg font-extrabold">🎤 {title}</h1>
          <p className="mt-1 text-sm text-gray-500">اقرئي السؤال المطلوب وأجيبي شفويًا — الحد الأقصى {maxSeconds} ثانية</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="text-center">
          <div className="mx-auto my-4 flex h-24 w-24 items-center justify-center rounded-full bg-brand-100 text-4xl">
            {rec.state === "recording" ? "🔴" : rec.state === "recorded" ? "✅" : "🎙️"}
          </div>
          {rec.state === "recording" && (
            <>
              <p className="mb-2 text-2xl font-extrabold text-red-600">{rec.seconds}s</p>
              <Progress value={rec.progress} className="mb-4" />
            </>
          )}

          {rec.previewUrl && (
            <audio controls src={rec.previewUrl} className="mx-auto mb-4 w-full" />
          )}

          <div className="flex flex-wrap justify-center gap-2">
            {rec.state === "idle" && <Button size="lg" onClick={rec.start}>بدء التسجيل</Button>}
            {rec.state === "recording" && (
              <Button size="lg" variant="destructive" onClick={rec.stop}>إيقاف وتسليم</Button>
            )}
            {rec.state === "recorded" && (
              <>
                <Button size="lg" variant="success" onClick={submit} disabled={uploading}>
                  {uploading ? "جارٍ الرفع…" : "إرسال التسجيل"}
                </Button>
                <Button size="lg" variant="outline" onClick={rec.reset}>إعادة التسجيل</Button>
              </>
            )}
          </div>

          {rec.error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-bold text-red-600">{rec.error}</p>}
          {msg && <p className={`mt-3 rounded-lg p-3 text-sm font-bold ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>{msg.text}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
