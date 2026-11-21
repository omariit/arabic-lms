import { describe, expect, it } from "vitest";
import { buildExamOrder, normaliseOrder, seededRandom, toOriginalIndex } from "@/lib/exam-order";

const questions = [
  { id: "q1", options: ["a", "b", "c", "d"] },
  { id: "q2", options: ["a", "b", "c", "d"] },
  { id: "q3", options: ["صح", "خطأ"] },
];

describe("buildExamOrder", () => {
  it("keeps the natural order when nothing is shuffled", () => {
    const order = buildExamOrder(questions, {});
    expect(order.q).toEqual(["q1", "q2", "q3"]);
    expect(order.o.q2).toEqual([0, 1, 2, 3]);
    expect(order.o.q3).toEqual([0, 1]);
  });

  it("shuffles questions but keeps every question exactly once", () => {
    const order = buildExamOrder(questions, { shuffleQuestions: true, rnd: seededRandom(7) });
    expect([...order.q].sort()).toEqual(["q1", "q2", "q3"]);
    expect(order.q).not.toEqual(["q1", "q2", "q3"]);
  });

  it("shuffles options as a permutation of the original indexes", () => {
    const order = buildExamOrder(questions, { shuffleOptions: true, rnd: seededRandom(3) });
    expect([...order.o.q1].sort()).toEqual([0, 1, 2, 3]);
    expect([...order.o.q3].sort()).toEqual([0, 1]);
  });

  it("is reproducible for a given seed (same student, same view)", () => {
    const a = buildExamOrder(questions, { shuffleQuestions: true, shuffleOptions: true, rnd: seededRandom(42) });
    const b = buildExamOrder(questions, { shuffleQuestions: true, shuffleOptions: true, rnd: seededRandom(42) });
    expect(a).toEqual(b);
  });
});

describe("toOriginalIndex", () => {
  it("maps a presented option back to the original option", () => {
    const order = { q: ["q1"], o: { q1: [2, 0, 3, 1] } };
    expect(toOriginalIndex(order, "q1", 0)).toBe(2);
    expect(toOriginalIndex(order, "q1", 3)).toBe(1);
  });

  it("rejects out-of-range answers instead of guessing", () => {
    const order = { q: ["q1"], o: { q1: [0, 1] } };
    expect(toOriginalIndex(order, "q1", 5)).toBeNull();
    expect(toOriginalIndex(order, "missing", 0)).toBeNull();
  });
});

describe("normaliseOrder", () => {
  it("falls back to natural order for garbage input", () => {
    expect(normaliseOrder(null, questions).q).toEqual(["q1", "q2", "q3"]);
    expect(normaliseOrder({ q: "nope" }, questions).o.q1).toEqual([0, 1, 2, 3]);
  });

  it("keeps the stored order and appends questions added later", () => {
    const stored = { q: ["q2"], o: { q2: [3, 2, 1, 0] } };
    const order = normaliseOrder(stored, questions);
    expect(order.q).toEqual(["q2", "q1", "q3"]);
    expect(order.o.q2).toEqual([3, 2, 1, 0]);
  });

  it("repairs an option permutation that lost entries", () => {
    const stored = { q: ["q1", "q2", "q3"], o: { q1: [2, 0], q2: [1], q3: [] } };
    const order = normaliseOrder(stored, questions);
    expect([...order.o.q1].sort()).toEqual([0, 1, 2, 3]);
    expect([...order.o.q2].sort()).toEqual([0, 1, 2, 3]);
    expect([...order.o.q3].sort()).toEqual([0, 1]);
  });
});
