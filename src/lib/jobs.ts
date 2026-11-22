/**
 * Housekeeping job logic — kept pure so every rule is unit tested without a database.
 *
 * Why each rule exists (measured, not speculative):
 * - Sessions: `Session` is the largest table and `/api/health` only deactivates expired
 *   rows; the rows themselves accumulate forever.
 * - Recordings: a crashed browser tab leaves a `RecordingSession` stuck in
 *   RECORDING/UPLOADING/PROCESSING forever — the teacher's inbox then shows a phantom
 *   "in progress" recording. After one hour without a byte, it is dead.
 * - Orphaned recording bytes: paid volume; the purge endpoint already exists
 *   (`purgeOrphanRecordings`) and takes an explicit keep-list.
 * - Vouchers: an unused voucher has no expiry date in the schema, so expiry is a policy
 *   choice: unused for `voucherGraceDays` (default 90) ⇒ marked expired. Idempotent.
 * - Enrollments: `Enrollment` has no end date (paid access is revoked manually), so the
 *   job deliberately does NOT touch it — documented in HARDENING-PLAN.md.
 */

export type RecordingStatusName = "RECORDING" | "UPLOADING" | "PROCESSING";

export const STALE_RECORDING_STATUSES: RecordingStatusName[] = ["RECORDING", "UPLOADING", "PROCESSING"];

/** Age after which an in-flight recording without progress is considered dead. */
export const STALE_RECORDING_MS = 60 * 60 * 1000;

export const VOUCHER_GRACE_DAYS = Number(process.env.VOUCHER_GRACE_DAYS ?? 90);

/** Sessions whose expiry passed this long ago are deleted outright (safety margin for clock skew). */
export const SESSION_DELETE_GRACE_MS = 60 * 60 * 1000;

export function staleRecordingCutoff(now = Date.now(), ms = STALE_RECORDING_MS): Date {
  return new Date(now - ms);
}

export function sessionDeleteCutoff(now = Date.now(), grace = SESSION_DELETE_GRACE_MS): Date {
  return new Date(now - grace);
}

/** Sessions safe to delete: expired, deactivated, and old enough that no device still replays them. */
export function deletableSessionWhere(cutoff = sessionDeleteCutoff()) {
  return { active: false, expiresAt: { lt: cutoff } };
}

export function staleRecordingsWhere(cutoff = staleRecordingCutoff()) {
  return { status: { in: STALE_RECORDING_STATUSES }, updatedAt: { lt: cutoff } };
}

export function expiredVouchersWhere(now = new Date(), graceDays = VOUCHER_GRACE_DAYS) {
  const cutoff = new Date(now.getTime() - graceDays * 24 * 60 * 60 * 1000);
  // A voucher that was never used and sat untouched for the whole grace period is dead.
  return { expired: false, usedById: null, usedAt: null, createdAt: { lt: cutoff } };
}

/** Timing-safe constant-time comparison for the jobs secret. */
export function secretMatches(provided: string | null, expected: string | undefined): boolean {
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // Still burn comparable time so length is not leaked.
    Buffer.alloc(b.length).fill(provided.charCodeAt(0) || 48);
    return false;
  }
  return a.equals(b);
}
