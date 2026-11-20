import { describe, expect, it } from "vitest";
import { canViewRecording } from "@/lib/recording-access";

/**
 * Student privacy is a hard requirement: a recording must never leak to a
 * student who is not enrolled (unless the lesson is an explicit free preview).
 */
const base = { userId: "t1", teacherId: "t1" };

describe("canViewRecording", () => {
  it("lets the owning teacher watch", () => {
    expect(canViewRecording({ ...base, role: "TEACHER", lesson: { access: "ENROLLED" }, enrolled: false })).toBe(true);
  });

  it("does not let another teacher watch someone else's recording", () => {
    expect(
      canViewRecording({ ...base, role: "TEACHER", userId: "t2", lesson: { access: "ENROLLED" }, enrolled: false }),
    ).toBe(false);
  });

  it("lets an admin watch any recording", () => {
    expect(canViewRecording({ ...base, role: "ADMIN", userId: "a1", lesson: { access: "ENROLLED" }, enrolled: false })).toBe(true);
  });

  it("refuses an assistant who does not own the recording", () => {
    expect(canViewRecording({ ...base, role: "ASSISTANT", userId: "s9", lesson: { access: "ENROLLED" }, enrolled: false })).toBe(false);
  });

  it("lets an enrolled student watch", () => {
    expect(canViewRecording({ ...base, role: "STUDENT", lesson: { access: "ENROLLED" }, enrolled: true })).toBe(true);
  });

  it("refuses a student who is not enrolled", () => {
    expect(canViewRecording({ ...base, role: "STUDENT", lesson: { access: "ENROLLED" }, enrolled: false })).toBe(false);
  });

  it("allows any signed-in student when the lesson is a free preview", () => {
    expect(canViewRecording({ ...base, role: "STUDENT", lesson: { access: "FREE_PREVIEW" }, enrolled: false })).toBe(true);
  });

  it("refuses a student when the recording is not attached to a lesson", () => {
    expect(canViewRecording({ ...base, role: "STUDENT", lesson: null, enrolled: false })).toBe(false);
  });
});
