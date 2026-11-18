import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rateLimit } from "@/lib/rate-limit";

// Key isolation between tests: use unique prefixes.
describe("rateLimit (sliding window)", () => {
  it("allows up to the limit, then blocks", () => {
    const key = "t1";
    for (let i = 0; i < 3; i++) {
      expect(rateLimit(key, 3, 60_000).ok).toBe(true);
    }
    const blocked = rateLimit(key, 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("is per-key isolated", () => {
    for (let i = 0; i < 5; i++) rateLimit("t2", 2, 60_000);
    expect(rateLimit("t2", 2, 60_000).ok).toBe(false);
    expect(rateLimit("t3", 2, 60_000).ok).toBe(true); // different key unaffected
  });
});

describe("rateLimit window expiry", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("unblocks after the window passes", () => {
    const key = "t5";
    vi.setSystemTime(1_700_000_000_000);
    for (let i = 0; i < 2; i++) expect(rateLimit(key, 2, 1_000).ok).toBe(true);
    expect(rateLimit(key, 2, 1_000).ok).toBe(false);
    vi.setSystemTime(1_700_000_000_000 + 1_500); // past window
    expect(rateLimit(key, 2, 1_000).ok).toBe(true);
  });
});
