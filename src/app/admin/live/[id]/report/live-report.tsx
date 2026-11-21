"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Report = {
  live: { id: string; title: string; status: string; startedAt: string | null; endedAt: string | null; course: { title: string } };
  attendance: Array<{ id: string; name: string; joinedAt: string; leftAt: string | null; seconds: number }>;
  absent: Array<{ userId: string; name: string }>;
  enrolled: number;
  polls: Array<{
    id: string;
    question: string;
    options: string[];
    counts: number[];
    total: number;
    correctIndex: number | null;
    status: string;
    createdAt: string;
    answers: Array<{ userId: string | null; name: string; optionIndex: number; correct: boolean | null }>;
    missing: Array<{ userId: string; name: string }>;
  }>;
};

const clock = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("ar-JO", { dateStyle: "short", timeStyle: "short" }) : "—";

const dur = (s: number) => {
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)} س ${m % 60} د` : `${m} د`;
};

export function LiveReport({ liveId }: { liveId: string }) {
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/live/${liveId}/report`, { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/login?expired=1";
        return;
      }
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error ?? "تعذّر تحميل التقرير — أعيدي المحاولة");
        return;
      }
      setData(j as Report);
    } catch {
      setError("تعذّر الاتصال بالخادم — تحقّقي من الإنترنت");
    } finally {
      setLoading(false);
    }
  }, [liveId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return <p className="rounded-2xl border border-brand-100 bg-white p-4 text-sm text-brand-900/60">… جارٍ تحميل تقرير الحصة</p>;
  }
  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
        {error}
        <Button size="sm" variant="outline" className="ms-2" onClick={() => void load()}>إعادة المحاولة</Button>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-brand-100 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-lg font-extrabold text-brand-950">📋 تقرير الحصة — {data.live.title}</h1>
            <p className="mt-1 text-xs text-brand-900/60">
              {data.live.course.title} · بدأت {clock(data.live.startedAt)} · انتهت {clock(data.live.endedAt)}
            </p>
          </div>
          <Link href="/admin/live" className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>رجوع للحصص</Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-brand-100 bg-white p-4">
          <p className="text-[11px] font-bold text-brand-900/55">الحاضرات</p>
          <p className="text-2xl font-extrabold text-emerald-700">{data.attendance.length}</p>
        </div>
        <div className="rounded-2xl border border-brand-100 bg-white p-4">
          <p className="text-[11px] font-bold text-brand-900/55">الغائبات</p>
          <p className="text-2xl font-extrabold text-amber-700">{data.absent.length}</p>
        </div>
        <div className="rounded-2xl border border-brand-100 bg-white p-4">
          <p className="text-[11px] font-bold text-brand-900/55">المسجّلات في الدورة</p>
          <p className="text-2xl font-extrabold text-brand-900">{data.enrolled}</p>
        </div>
      </div>

      <section className="rounded-3xl border border-brand-100 bg-white p-5">
        <h2 className="mb-3 text-sm font-extrabold text-brand-950">👥 سجل الحضور</h2>
        {data.attendance.length === 0 ? (
          <p className="text-xs text-brand-900/50">لم تُسجّل حضور في هذه الحصة.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead>
                <tr className="text-[11px] text-brand-900/55">
                  <th className="p-2 text-start">الاسم</th>
                  <th className="p-2 text-start">دخلت</th>
                  <th className="p-2 text-start">خرجت</th>
                  <th className="p-2 text-start">المدة</th>
                </tr>
              </thead>
              <tbody>
                {data.attendance.map((a) => (
                  <tr key={a.id} className="border-t border-brand-50">
                    <td className="p-2 font-extrabold text-brand-950">{a.name}</td>
                    <td className="p-2 text-brand-900/70">{clock(a.joinedAt)}</td>
                    <td className="p-2 text-brand-900/70">{a.leftAt ? clock(a.leftAt) : "في الحصة"}</td>
                    <td className="p-2 text-brand-900/70">{a.leftAt ? dur(a.seconds) : "في الحصة"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.absent.length > 0 && (
          <p data-testid="report-absent" className="mt-3 rounded-xl bg-amber-50 p-2.5 text-[11px] font-bold text-amber-800">
            ✗ لم تحضر: {data.absent.map((a) => a.name).join("، ")}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-extrabold text-brand-950">❓ أسئلة الحصة ({data.polls.length})</h2>
        {data.polls.length === 0 ? (
          <p className="rounded-2xl border border-brand-100 bg-white p-4 text-xs text-brand-900/50">لم تُطرح أسئلة في هذه الحصة.</p>
        ) : (
          data.polls.map((p, i) => (
            <div key={p.id} data-testid="report-poll" className="rounded-2xl border border-brand-100 bg-white p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-extrabold text-brand-950">{i + 1}. {p.question}</p>
                <span className="text-[11px] font-bold text-brand-900/55">
                  {p.status === "CLOSED" ? "مغلق" : "مفتوح"} · {p.total} إجابة
                </span>
              </div>
              <div className="grid gap-1 sm:grid-cols-2">
                {p.options.map((opt, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-[11px] font-bold ${
                      p.correctIndex === idx ? "bg-emerald-50 text-emerald-900" : "bg-brand-50/60 text-brand-950"
                    }`}
                  >
                    <span className="truncate">{p.correctIndex === idx ? "✔ " : ""}{opt}</span>
                    <span className="shrink-0">{p.counts[idx] ?? 0}</span>
                  </div>
                ))}
              </div>
              {p.answers.length > 0 && (
                <p className="mt-2 text-[11px] font-bold text-emerald-800">
                  أجابت: {p.answers.map((a) => `${a.name}${a.correct === null ? "" : a.correct ? " ✓" : " ✗"}`).join("، ")}
                </p>
              )}
              {p.missing.length > 0 && (
                <p data-testid="report-poll-missing" className="mt-1 text-[11px] font-bold text-amber-800">
                  لم تُجب: {p.missing.map((m) => m.name).join("، ")}
                </p>
              )}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
