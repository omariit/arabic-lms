/**
 * In-lecture questions (polls). Pure helpers — the socket server and the API both
 * use them, so "is this poll still open?" has exactly one answer.
 */

export type PollLike = {
  status: "OPEN" | "CLOSED";
  closeAt?: Date | string | null;
  closedAt?: Date | string | null;
};

export type PollOption = string;

const asTime = (v: Date | string | null | undefined) => {
  if (!v) return null;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};

/**
 * A poll is open while the teacher has not closed it **and** the countdown has not
 * run out. The countdown alone is never enough: closing by hand ends it at once.
 */
export function pollIsOpen(poll: PollLike, now: number | Date = Date.now()): boolean {
  if (poll.status !== "OPEN" || poll.closedAt) return false;
  const closeAt = asTime(poll.closeAt);
  const t = now instanceof Date ? now.getTime() : now;
  return closeAt === null || closeAt > t;
}

export function pollSecondsLeft(poll: PollLike, now: number = Date.now()): number | null {
  const closeAt = asTime(poll.closeAt);
  if (closeAt === null || !pollIsOpen(poll, now)) return null;
  return Math.max(0, Math.ceil((closeAt - now) / 1000));
}

/** What a student may see: never the right answer while the question is open. */
export function pollForParticipant<T extends { correctIndex?: number | null }>(
  poll: T,
  now: number = Date.now(),
  revealed = false,
): Omit<T, "correctIndex"> & { correctIndex: number | null; open: boolean; secondsLeft: number | null } {
  const open = pollIsOpen(poll as unknown as PollLike, now);
  return {
    ...poll,
    correctIndex: open && !revealed ? null : poll.correctIndex ?? null,
    open,
    secondsLeft: pollSecondsLeft(poll as unknown as PollLike, now),
  };
}

export type RosterEntry = { userId?: string | null; name: string; role?: string };

export type PollAnswerLike = {
  userId?: string | null;
  guestSocketId?: string | null;
  guestName?: string | null;
  optionIndex: number;
};

export type PollResult = {
  counts: number[];
  total: number;
  answered: Array<{ name: string; optionIndex: number; guest: boolean }>;
  /** Enrolled students who have not answered yet — the teacher's follow-up list. */
  missing: Array<{ userId: string; name: string }>;
  /** Guests who answered, kept apart so they never look like an enrolled absence. */
  guestAnswers: Array<{ name: string; optionIndex: number }>;
  correctCount: number | null;
};

/**
 * Results of one poll against the roster.
 * `missing` is computed from enrolled students only (guests have no record to chase).
 */
export function pollResults(
  options: PollOption[],
  answers: PollAnswerLike[],
  roster: RosterEntry[],
  correctIndex?: number | null,
): PollResult {
  const counts = options.map(() => 0);
  const answered: PollResult["answered"] = [];
  const seen = new Set<string>();

  for (const a of answers) {
    if (a.optionIndex < 0 || a.optionIndex >= counts.length) continue;
    const key = a.userId ? `u:${a.userId}` : `g:${a.guestSocketId ?? a.guestName ?? Math.random()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    counts[a.optionIndex] += 1;
    answered.push({
      name: a.userId ? roster.find((r) => r.userId === a.userId)?.name ?? a.guestName ?? "طالبة" : a.guestName ?? "ضيفة",
      optionIndex: a.optionIndex,
      guest: !a.userId,
    });
  }

  const students = roster.filter((r) => Boolean(r.userId) && (r.role ?? "STUDENT") === "STUDENT");
  const missing = students
    .filter((r) => !answers.some((a) => a.userId && a.userId === r.userId))
    .map((r) => ({ userId: String(r.userId), name: r.name }));

  const correctCount =
    correctIndex === null || correctIndex === undefined || correctIndex < 0
      ? null
      : counts[correctIndex] ?? 0;

  return {
    counts,
    total: counts.reduce((a, b) => a + b, 0),
    answered,
    missing,
    guestAnswers: answered.filter((a) => a.guest).map((a) => ({ name: a.name, optionIndex: a.optionIndex })),
    correctCount,
  };
}

/** Validation shared by the socket server and the API (same limits, same messages). */
export function validatePollInput(input: {
  question?: unknown;
  options?: unknown;
  correctIndex?: unknown;
  durationSec?: unknown;
}): { ok: true; question: string; options: string[]; correctIndex: number | null; durationSec: number } | { ok: false; error: string } {
  const question = String(input.question ?? "").trim().slice(0, 500);
  if (question.length < 3) return { ok: false, error: "اكتبي نص السؤال" };

  const raw = Array.isArray(input.options) ? input.options : [];
  const options = raw.map((o) => String(o ?? "").trim().slice(0, 200)).filter(Boolean).slice(0, 6);
  if (options.length < 2) return { ok: false, error: "أضيفي خيارين على الأقل" };

  const idxRaw = input.correctIndex;
  let correctIndex: number | null = null;
  if (idxRaw !== null && idxRaw !== undefined && idxRaw !== "" && Number.isFinite(Number(idxRaw))) {
    const n = Number(idxRaw);
    if (n < 0 || n >= options.length) return { ok: false, error: "الإجابة الصحيحة غير مطابقة للخيارات" };
    correctIndex = n;
  }

  const dRaw = Number(input.durationSec ?? 0);
  const allowed = [0, 15, 30, 45, 60, 90, 120, 180, 300];
  const durationSec = allowed.includes(dRaw) ? dRaw : 0;

  return { ok: true, question, options, correctIndex, durationSec };
}

/** Duration in whole minutes for the attendance report. */
export function attendanceDuration(joinedAt: Date | string, leftAt?: Date | string | null, now: number = Date.now()): number {
  const a = asTime(joinedAt) ?? now;
  const b = asTime(leftAt) ?? now;
  return Math.max(0, Math.round((b - a) / 1000));
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h} س ${m} د`;
  return `${m} د`;
}
