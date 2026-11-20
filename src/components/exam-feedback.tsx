"use client";

import { useState } from "react";

type Result = {
  status: string;
  grade: number | null;
  maxGrade: number;
  feedbackText: string | null;
  audioUrl: string | null;
};

/** Student-facing card: opens the teacher's written + voice correction for one attempt. */
export function ExamFeedback({ attemptId, label }: { attemptId: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    const next = !open;
    setOpen(next);
    if (!next || data) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/exams/feedback/${attemptId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "تعذّر تحميل التصحيح");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-1">
      <button onClick={load} className="text-xs font-bold text-brand-700 underline underline-offset-2">
        {open ? "إخفاء تصحيح المعلمة" : label}
      </button>
      {open && (
        <div className="mt-2 rounded-xl border border-brand-100 bg-brand-50/60 p-3">
          {busy && <p className="text-xs text-gray-500">جارٍ التحميل…</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}
          {data && (
            <div className="space-y-2">
              {data.grade !== null && (
                <p className="text-xs font-bold text-brand-800">
                  الدرجة: {data.grade} / {data.maxGrade}
                </p>
              )}
              {data.feedbackText && (
                <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700">{data.feedbackText}</p>
              )}
              {data.audioUrl ? (
                <audio controls src={data.audioUrl} className="w-full" />
              ) : (
                <p className="text-xs text-gray-400">لا يوجد تعليق صوتي مرفق.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
