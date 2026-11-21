"use client";

import { Button } from "@/components/ui/button";

export type ActivePoll = {
  id: string;
  question: string;
  options: string[];
  status: "OPEN" | "CLOSED";
  closeAt: string | null;
  counts: number[];
  correctIndex: number | null;
  open: boolean;
};

export type PollProgress = {
  id: string;
  counts: number[];
  total: number;
  answered: Array<{ name: string; optionIndex: number; guest?: boolean }>;
  missing: Array<{ userId: string; name: string }>;
  closed?: boolean;
};

export type AttendanceData = {
  rows: Array<{ id: string; name: string; joinedAt: string; leftAt: string | null; seconds: number }>;
  missing: Array<{ userId: string; name: string }>;
  enrolled: number;
};

const fmtSeconds = (s: number) => {
  if (s < 60) return `${s} ث`;
  const m = Math.floor(s / 60);
  if (m >= 60) return `${Math.floor(m / 60)} س ${m % 60} د`;
  return `${m} د`;
};

const fmtClock = (iso: string) =>
  new Date(iso).toLocaleTimeString("ar-JO", { hour: "2-digit", minute: "2-digit", hour12: true });

/** The question the teacher just asked — same card for students, guests and the hotel. */
export function LivePollCard({
  poll,
  secondsLeft,
  answered,
  isHost,
  onAnswer,
}: {
  poll: ActivePoll;
  secondsLeft: number | null;
  answered: { optionIndex: number; correct: boolean | null; correctIndex?: number | null } | null;
  isHost: boolean;
  onAnswer: (index: number) => void;
}) {
  const total = poll.counts.reduce((a, b) => a + b, 0);
  const revealed = answered !== null || !poll.open;
  // The right answer arrives with her own result (before the teacher closes the question).
  const rightIndex = poll.correctIndex ?? answered?.correctIndex ?? null;

  return (
    <div
      data-testid="live-poll"
      className="rounded-2xl border-2 border-brand-300 bg-white p-3 shadow-sm"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-extrabold text-brand-700">
          ❓ سؤال من المعلمة
          {poll.open && secondsLeft !== null && (
            <span data-testid="poll-timer" className={`ms-2 rounded-full px-2 py-0.5 text-[10px] ${secondsLeft <= 10 ? "bg-red-100 text-red-700" : "bg-brand-100 text-brand-800"}`}>
              ⏳ {secondsLeft} ثانية
            </span>
          )}
          {!poll.open && <span className="ms-2 rounded-full bg-brand-100 px-2 py-0.5 text-[10px]">انتهى السؤال</span>}
        </p>
        {revealed && <span className="text-[10px] font-bold text-brand-900/60">{total} إجابة</span>}
      </div>

      <p className="mb-2 text-sm font-extrabold leading-7 text-brand-950">{poll.question}</p>

      <div className="space-y-1.5">
        {poll.options.map((opt, i) => {
          const mine = answered?.optionIndex === i;
          const isCorrect = revealed && rightIndex === i;
          return (
            <button
              key={i}
              type="button"
              data-testid="poll-option"
              disabled={!poll.open || answered !== null || isHost}
              onClick={() => onAnswer(i)}
              className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-start text-xs font-bold transition ${
                isCorrect
                  ? "border-emerald-400 bg-emerald-50 text-emerald-900"
                  : mine
                    ? "border-brand-500 bg-brand-50 text-brand-950"
                    : "border-brand-100 bg-brand-50/40 text-brand-950"
              } ${!poll.open || answered !== null || isHost ? "opacity-90" : "hover:border-brand-400"}`}
            >
              <span className="min-w-0">
                {mine && "✓ "}
                {opt}
                {isCorrect && " ✔"}
              </span>
              {revealed && <span className="shrink-0 text-[10px] text-brand-900/55">{poll.counts[i] ?? 0}</span>}
            </button>
          );
        })}
      </div>

      {answered ? (
        <p
          data-testid="poll-answered"
          className={`mt-2 rounded-xl px-3 py-2 text-center text-xs font-extrabold ${
            answered.correct === null
              ? "bg-brand-50 text-brand-800"
              : answered.correct
                ? "bg-emerald-50 text-emerald-800"
                : "bg-amber-50 text-amber-800"
          }`}
        >
          {answered.correct === null
            ? "✓ وصلت إجابتك للمعلمة"
            : answered.correct
              ? "✓ إجابة صحيحة، أحسنتِ"
              : `✗ الإجابة الصحيحة: ${rightIndex !== null ? poll.options[rightIndex] : "—"}`}
        </p>
      ) : poll.open && !isHost ? (
        <p className="mt-2 text-center text-[10px] text-brand-900/50">اختاري إجابة واحدة — تُرسل مباشرة للمعلمة</p>
      ) : null}
    </div>
  );
}

/** The teacher's live picture: counts, who answered, who is still missing. */
export function PollResultsCard({
  poll,
  progress,
  onClose,
}: {
  poll: ActivePoll;
  progress: PollProgress | null;
  onClose: () => void;
}) {
  const counts = progress?.counts ?? poll.counts;
  const total = counts.reduce((a, b) => a + b, 0);
  const answered = progress?.answered ?? [];
  const missing = progress?.missing ?? [];
  const max = Math.max(1, ...counts);

  return (
    <div data-testid="poll-results" className="rounded-2xl border border-brand-200 bg-brand-50/50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-extrabold text-brand-950">📊 نتيجة السؤال — {total} إجابة</p>
        {poll.open && (
          <Button size="sm" variant="destructive" data-testid="poll-close" onClick={onClose}>
            إغلاق السؤال
          </Button>
        )}
      </div>
      <div className="space-y-1">
        {poll.options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-1/2 shrink-0 truncate text-[11px] font-bold text-brand-950">
              {poll.correctIndex === i ? "✔ " : ""}
              {opt}
            </span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-white">
              <span
                className={`block h-full rounded-full ${poll.correctIndex === i ? "bg-emerald-500" : "bg-brand-500"}`}
                style={{ width: `${Math.round(((counts[i] ?? 0) / max) * 100)}%` }}
              />
            </span>
            <span className="w-6 shrink-0 text-end text-[11px] font-extrabold text-brand-800">{counts[i] ?? 0}</span>
          </div>
        ))}
      </div>

      {answered.length > 0 && (
        <p className="mt-2 text-[11px] font-bold text-emerald-800">
          ✓ أجابت: {answered.map((a) => a.name).join("، ")}
        </p>
      )}
      <p data-testid="poll-missing" className="mt-1 text-[11px] font-bold leading-6 text-amber-800">
        {missing.length > 0 ? `⏳ لم تُجب بعد: ${missing.map((m) => m.name).join("، ")}` : "✓ جميع الطالبات أجبن"}
      </p>
    </div>
  );
}

/** Attendance of this lecture, kept for follow-up after the meeting ends. */
export function AttendanceCard({ data, onRefresh, liveId }: { data: AttendanceData | null; onRefresh: () => void; liveId: string }) {
  return (
    <div data-testid="attendance" className="rounded-2xl border border-brand-100 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-extrabold text-brand-950">📋 سجل الحضور</p>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={onRefresh}>تحديث</Button>
          <a href={`/admin/live/${liveId}/report`}>
            <Button size="sm" variant="secondary">التقرير الكامل</Button>
          </a>
        </div>
      </div>
      {!data ? (
        <p className="text-[11px] text-brand-900/50">اضغطي «تحديث» لعرض الحاضرات.</p>
      ) : (
        <>
          <p className="mb-1.5 text-[11px] font-bold text-brand-900/70">
            حاضرات: {data.rows.length} من {data.enrolled}
          </p>
          <ul className="space-y-1">
            {data.rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-brand-50/60 px-2.5 py-1.5">
                <span className="truncate text-[11px] font-extrabold text-brand-950">{r.name}</span>
                <span className="shrink-0 text-[10px] text-brand-900/60">
                  {fmtClock(r.joinedAt)} · {fmtSeconds(r.seconds)}
                </span>
              </li>
            ))}
            {data.rows.length === 0 && <li className="text-[11px] text-brand-900/50">لم تُسجّل حضور بعد</li>}
          </ul>
          {data.missing.length > 0 && (
            <p data-testid="attendance-missing" className="mt-1.5 text-[11px] font-bold text-amber-800">
              ✗ لم تحضر: {data.missing.map((m) => m.name).join("، ")}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export { fmtSeconds, fmtClock };
