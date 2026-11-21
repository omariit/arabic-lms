/**
 * Question randomisation for MCQ exams.
 *
 * Two rules that matter:
 *  1. The order is generated ONCE per attempt and stored, so resuming, grading
 *     and the review screen all agree with what the student actually saw.
 *  2. `answers` are always saved with the ORIGINAL option index, so enabling or
 *     disabling shuffling later never invalidates old results.
 */

export type OrderQuestion = { id: string; options: unknown };

export type ExamOrder = {
  /** question ids in presentation order */
  q: string[];
  /** question id → original option indexes in presentation order */
  o: Record<string, number[]>;
};

function shuffled<T>(items: T[], rnd: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Deterministic PRNG (mulberry32) so a seed reproduces an order in tests. */
export function seededRandom(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildExamOrder(
  questions: OrderQuestion[],
  opts: { shuffleQuestions?: boolean; shuffleOptions?: boolean; rnd?: () => number } = {},
): ExamOrder {
  const rnd = opts.rnd ?? Math.random;
  const ids = questions.map((q) => q.id);
  const q = opts.shuffleQuestions ? shuffled(ids, rnd) : ids;

  const o: Record<string, number[]> = {};
  for (const item of questions) {
    const count = Array.isArray(item.options) ? item.options.length : 0;
    const natural = Array.from({ length: count }, (_, i) => i);
    o[item.id] = opts.shuffleOptions ? shuffled(natural, rnd) : natural;
  }
  return { q, o };
}

/** Normalise whatever is stored (or a corrupt/absent value) into a safe order. */
export function normaliseOrder(raw: unknown, questions: OrderQuestion[]): ExamOrder {
  const fallback = buildExamOrder(questions);
  if (!raw || typeof raw !== "object") return fallback;
  const value = raw as Partial<ExamOrder>;
  if (!Array.isArray(value.q) || !value.o || typeof value.o !== "object") return fallback;

  const known = new Set(questions.map((x) => x.id));
  const q = value.q.filter((id) => typeof id === "string" && known.has(id));
  // A question added after the attempt started must still be presented.
  for (const id of known) if (!q.includes(id)) q.push(id);

  const o: Record<string, number[]> = {};
  for (const item of questions) {
    const count = Array.isArray(item.options) ? item.options.length : 0;
    const stored = (value.o as Record<string, unknown>)[item.id];
    const valid = Array.isArray(stored)
      ? stored.filter((n): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) < count)
      : [];
    const natural = Array.from({ length: count }, (_, i) => i);
    for (const n of natural) if (!valid.includes(n)) valid.push(n);
    o[item.id] = valid;
  }
  return { q, o };
}

/** Presented index → original index (what grading compares against). */
export function toOriginalIndex(order: ExamOrder, questionId: string, presented: number): number | null {
  const map = order.o[questionId];
  if (!map || presented < 0 || presented >= map.length) return null;
  return map[presented];
}
