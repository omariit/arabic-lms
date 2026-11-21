import { describe, expect, it } from "vitest";
import {
  attendanceDuration,
  formatDuration,
  pollForParticipant,
  pollIsOpen,
  pollResults,
  pollSecondsLeft,
  validatePollInput,
} from "@/lib/live-poll";

const now = new Date("2026-11-21T10:00:00Z").getTime();

describe("poll window", () => {
  it("is open with no deadline", () => {
    expect(pollIsOpen({ status: "OPEN", closeAt: null }, now)).toBe(true);
    expect(pollSecondsLeft({ status: "OPEN", closeAt: null }, now)).toBeNull();
  });

  it("is open before the deadline and closed after it", () => {
    const closeAt = new Date(now + 30_000);
    expect(pollIsOpen({ status: "OPEN", closeAt }, now)).toBe(true);
    expect(pollSecondsLeft({ status: "OPEN", closeAt }, now)).toBe(30);
    expect(pollIsOpen({ status: "OPEN", closeAt }, now + 30_001)).toBe(false);
  });

  it("closing by hand beats a far-away deadline", () => {
    expect(pollIsOpen({ status: "CLOSED", closeAt: new Date(now + 600_000), closedAt: new Date(now) }, now)).toBe(false);
  });

  it("accepts ISO strings from the database", () => {
    expect(pollIsOpen({ status: "OPEN", closeAt: new Date(now + 5000).toISOString() }, now)).toBe(true);
  });
});

describe("what a participant sees", () => {
  const poll = { id: "p1", status: "OPEN" as const, closeAt: new Date(now + 60_000), correctIndex: 2, options: ["أ", "ب", "ج"] };

  it("hides the right answer while open", () => {
    const view = pollForParticipant(poll, now);
    expect(view.correctIndex).toBeNull();
    expect(view.open).toBe(true);
    expect(view.secondsLeft).toBe(60);
  });

  it("reveals it to the student who already answered", () => {
    expect(pollForParticipant(poll, now, true).correctIndex).toBe(2);
  });

  it("reveals it after closing", () => {
    expect(pollForParticipant(poll, now + 61_000).correctIndex).toBe(2);
  });
});

describe("poll results", () => {
  const roster = [
    { userId: "s1", name: "سارة", role: "STUDENT" },
    { userId: "s2", name: "مريم", role: "STUDENT" },
    { userId: "t1", name: "أ. خولة", role: "TEACHER" },
  ];

  it("counts answers and lists who is missing", () => {
    const r = pollResults(["أ", "ب", "ج"], [{ userId: "s1", optionIndex: 1 }], roster, 1);
    expect(r.counts).toEqual([0, 1, 0]);
    expect(r.total).toBe(1);
    expect(r.answered.map((a) => a.name)).toEqual(["سارة"]);
    expect(r.missing.map((m) => m.name)).toEqual(["مريم"]); // the teacher is never "missing"
    expect(r.correctCount).toBe(1);
  });

  it("ignores a second answer from the same student", () => {
    const r = pollResults(["أ", "ب"], [{ userId: "s1", optionIndex: 0 }, { userId: "s1", optionIndex: 1 }], roster);
    expect(r.total).toBe(1);
    expect(r.counts).toEqual([1, 0]);
  });

  it("keeps guests apart from the absent students", () => {
    const r = pollResults(["أ", "ب"], [{ guestSocketId: "g1", guestName: "ضيفة", optionIndex: 1 }], roster);
    expect(r.guestAnswers).toEqual([{ name: "ضيفة", optionIndex: 1 }]);
    expect(r.missing.map((m) => m.name)).toEqual(["سارة", "مريم"]);
  });

  it("has no correct count for an opinion poll", () => {
    expect(pollResults(["أ", "ب"], [], roster, null).correctCount).toBeNull();
  });
});

describe("validation", () => {
  it("rejects a short question and too few options", () => {
    expect(validatePollInput({ question: "؟", options: ["أ", "ب"] }).ok).toBe(false);
    expect(validatePollInput({ question: "ما حكم الإظهار؟", options: ["أ"] }).ok).toBe(false);
  });

  it("accepts a valid question and clamps the timer to the allowed list", () => {
    const v = validatePollInput({ question: "ما حكم الإظهار؟", options: ["أ", "ب"], correctIndex: 1, durationSec: 60 });
    expect(v).toMatchObject({ ok: true, correctIndex: 1, durationSec: 60 });
    const bad = validatePollInput({ question: "ما حكم الإظهار؟", options: ["أ", "ب"], durationSec: 7 });
    expect(bad).toMatchObject({ ok: true, durationSec: 0 });
  });

  it("rejects a correct answer outside the options", () => {
    expect(validatePollInput({ question: "ما حكم الإظهار؟", options: ["أ", "ب"], correctIndex: 5 }).ok).toBe(false);
  });
});

describe("attendance durations", () => {
  it("computes seconds and formats them", () => {
    const j = new Date(now);
    const l = new Date(now + 25 * 60_000);
    expect(attendanceDuration(j, l)).toBe(1500);
    expect(formatDuration(1500)).toBe("25 د");
    expect(formatDuration(3900)).toBe("1 س 5 د");
    expect(attendanceDuration(j, null, now + 60_000)).toBe(60);
  });
});
