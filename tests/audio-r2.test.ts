import { describe, it, expect } from "vitest";
import { mimeToFileExtension, pickMimeType } from "@/hooks/use-audio-recorder";
import { r2Configured, newAudioKey } from "@/lib/r2";

describe("mimeToFileExtension", () => {
  it("maps containers to extensions", () => {
    expect(mimeToFileExtension("audio/webm;codecs=opus")).toBe("webm");
    expect(mimeToFileExtension("audio/webm")).toBe("webm");
    expect(mimeToFileExtension("audio/mp4")).toBe("m4a");
    expect(mimeToFileExtension("audio/aac")).toBe("m4a");
    expect(mimeToFileExtension("audio/ogg;codecs=opus")).toBe("ogg");
    expect(mimeToFileExtension("")).toBe("audio");
  });
});

describe("pickMimeType", () => {
  it("returns a supported mime or empty string, never throwing", () => {
    // In Node there is no MediaRecorder, so this must return "" without throwing.
    expect(typeof pickMimeType()).toBe("string");
  });
});

describe("r2 helpers", () => {
  it("reports unconfigured without env vars", () => {
    const saved = { a: process.env.R2_ACCOUNT_ID, b: process.env.R2_ACCESS_KEY_ID, c: process.env.R2_SECRET_ACCESS_KEY, d: process.env.R2_BUCKET_NAME };
    for (const k of [saved.a, saved.b, saved.c, saved.d]) delete process.env[k as keyof typeof saved];
    expect(r2Configured()).toBe(false);
    // restore
    if (saved.a) process.env.R2_ACCOUNT_ID = saved.a;
    if (saved.b) process.env.R2_ACCESS_KEY_ID = saved.b;
    if (saved.c) process.env.R2_SECRET_ACCESS_KEY = saved.c;
    if (saved.d) process.env.R2_BUCKET_NAME = saved.d;
  });

  it("newAudioKey places files in kind/date/user namespace", () => {
    const key = newAudioKey("submission", "user-1");
    expect(key).toMatch(/^submission\/\d{4}-\d{2}-\d{2}\/user-1\/[0-9a-f-]{36}$/);
    const fb = newAudioKey("feedback", "user-2");
    expect(fb.startsWith("feedback/")).toBe(true);
    expect(newAudioKey("submission", "u")).not.toBe(newAudioKey("submission", "u")); // UUID uniqueness
  });
});
