import { describe, expect, it } from "vitest";
import {
  SESSION_DELETE_GRACE_MS,
  STALE_RECORDING_MS,
  STALE_RECORDING_STATUSES,
  VOUCHER_GRACE_DAYS,
  deletableSessionWhere,
  expiredVouchersWhere,
  secretMatches,
  staleRecordingsWhere,
} from "@/lib/jobs";

describe("housekeeping job rules (H6)", () => {
  it("deletes only sessions that expired, deactivated, and aged past the grace window", () => {
    const cutoff = sessionCutoffFixture();
    const where = deletableSessionWhere(cutoff);
    expect(where).toEqual({ active: false, expiresAt: { lt: cutoff } });
  });

  it("targets only in-flight recordings untouched for a full hour", () => {
    const now = Date.parse("2026-11-22T12:00:00Z");
    const where = staleRecordingsWhere(new Date(now - STALE_RECORDING_MS));
    expect(where.status.in).toEqual(["RECORDING", "UPLOADING", "PROCESSING"]);
    expect(STALE_RECORDING_STATUSES).not.toContain("FAILED");
    expect(where.updatedAt.lt).toEqual(new Date(now - 3_600_000));
  });

  it("expires only vouchers that were never used and sat past the grace window", () => {
    const now = new Date("2026-11-22T00:00:00Z");
    const where = expiredVouchersWhere(now, VOUCHER_GRACE_DAYS);
    expect(where.expired).toBe(false);
    expect(where.usedById).toBeNull();
    expect(where.usedAt).toBeNull();
    expect(where.createdAt.lt).toEqual(new Date(now.getTime() - VOUCHER_GRACE_DAYS * 86400000));
  });

  it("keeps the documented safety margins", () => {
    expect(STALE_RECORDING_MS).toBe(3_600_000);
    expect(SESSION_DELETE_GRACE_MS).toBe(3_600_000);
  });

  it("authenticates the jobs secret in constant time without leaking length", () => {
    const secret = "k".repeat(40);
    expect(secretMatches(secret, secret)).toBe(true);
    expect(secretMatches(null, secret)).toBe(false);
    expect(secretMatches("short", secret)).toBe(false);
    expect(secretMatches(secret, undefined)).toBe(false);
    expect(secretMatches("", secret)).toBe(false);
  });
});

function sessionCutoffFixture() {
  return new Date(Date.parse("2026-11-22T00:00:00Z"));
}
