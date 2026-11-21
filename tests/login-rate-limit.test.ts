import { describe, expect, it, vi } from "vitest";
import { rateLimit, rateLimitPeek, rateLimitReset } from "@/lib/rate-limit";

/**
 * Login lockouts must protect the account without locking out the teacher who is
 * simply retrying her own password.
 */
describe("rate limiter peek/reset", () => {
  it("peeks without consuming the bucket", () => {
    const key = `t-${Math.random()}`;
    expect(rateLimitPeek(key, 3, 60_000).remaining).toBe(3);
    rateLimit(key, 3, 60_000);
    rateLimit(key, 3, 60_000);
    expect(rateLimitPeek(key, 3, 60_000).remaining).toBe(1);
    expect(rateLimitPeek(key, 3, 60_000).remaining).toBe(1); // still 1: not consumed
  });

  it("reports zero remaining with a wait time once exhausted", () => {
    const key = `t-${Math.random()}`;
    for (let i = 0; i < 2; i++) rateLimit(key, 2, 60_000);
    const state = rateLimitPeek(key, 2, 60_000);
    expect(state.remaining).toBe(0);
    expect(state.retryAfter).toBeGreaterThan(0);
    expect(state.retryAfter).toBeLessThanOrEqual(60);
  });

  it("a successful login clears the failure history", () => {
    const key = `t-${Math.random()}`;
    for (let i = 0; i < 2; i++) rateLimit(key, 2, 60_000);
    expect(rateLimitPeek(key, 2, 60_000).remaining).toBe(0);
    rateLimitReset(key);
    expect(rateLimitPeek(key, 2, 60_000).remaining).toBe(2);
  });
});
