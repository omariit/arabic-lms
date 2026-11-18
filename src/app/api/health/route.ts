import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/** Railway/uptime health check: verifies DB connectivity and prunes expired sessions. */
export async function GET() {
  try {
    const t0 = Date.now();
    await db.$queryRaw`SELECT 1`;
    // Housekeeping on every health hit keeps session table lean with zero cron cost.
    await db.session.updateMany({
      where: { active: true, expiresAt: { lt: new Date() } },
      data: { active: false },
    });
    return NextResponse.json({
      status: "ok",
      db: "up",
      dbLatencyMs: Date.now() - t0,
      uptime: Math.round(process.uptime()),
    });
  } catch (e) {
    return NextResponse.json(
      { status: "degraded", db: "down", error: e instanceof Error ? e.message : "unknown" },
      { status: 503 }
    );
  }
}
