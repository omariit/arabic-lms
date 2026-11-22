import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { purgeOrphanRecordings, recordingConfigured } from "@/lib/recording";
import {
  deletableSessionWhere,
  expiredVouchersWhere,
  secretMatches,
  staleRecordingsWhere,
  staleRecordingCutoff,
} from "@/lib/jobs";

/**
 * Internal housekeeping (H6), designed for an hourly scheduler (GitHub Actions cron).
 *
 * Auth: `Authorization: Bearer <JOBS_SECRET>` — timing-safe, and the route is inert
 * unless the operator sets JOBS_SECRET, so an unconfigured deployment has no new
 * attack surface. Every step is idempotent and safe to retry.
 *
 * Deliberately NOT done here: revoking enrollments (they have no end date — access is
 * a staff decision) and anything destructive to recording *rows* other than marking
 * stuck ones FAILED; byte cleanup goes through the audited purge endpoint.
 */
export async function POST(req: Request) {
  const secret = process.env.JOBS_SECRET;
  if (!secret) return NextResponse.json({ error: "المهام الدورية غير مفعّلة" }, { status: 503 });

  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!secretMatches(provided, secret)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const report: Record<string, unknown> = { ranAt: new Date().toISOString() };

  // 1. Delete sessions that expired and were deactivated more than an hour ago.
  const sessions = await db.session.deleteMany({ where: deletableSessionWhere() });
  report.sessionsDeleted = sessions.count;

  // 2. Mark crashed recordings FAILED (no update for an hour while still in-flight).
  const stale = await db.recordingSession.updateMany({
    where: staleRecordingsWhere(),
    data: { status: "FAILED", errorMessage: "توقّف التسجيل دون إكمال — عُلِّم تلقائيًا بالمهمة الدورية" },
  });
  report.recordingsMarkedFailed = stale.count;

  // 3. Free orphaned recording bytes on the paid volume (keep everything the DB references).
  if (recordingConfigured()) {
    const rows = await db.recordingSession.findMany({ select: { serviceId: true } });
    const keep = rows.map((r) => r.serviceId).filter(Boolean);
    try {
      report.purge = await purgeOrphanRecordings(keep);
    } catch (e) {
      report.purgeError = e instanceof Error ? e.message : "purge failed";
    }
  } else {
    report.purge = "skipped: recording service not configured";
  }

  // 4. Expire vouchers that were never used within the grace window.
  const vouchers = await db.voucher.updateMany({
    where: expiredVouchersWhere(),
    data: { expired: true },
  });
  report.vouchersExpired = vouchers.count;

  return NextResponse.json({ ok: true, ...report });
}

/** A GET alias so the scheduler can also use plain HTTPS GET; same auth, same work. */
export const GET = POST;
