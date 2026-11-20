import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { callbackAuthorized } from "@/lib/recording";
import type { RecordingStatus } from "@prisma/client";

/**
 * Internal callback from the recording service (no user session — authenticated by
 * the shared secret header). Keeps the app's status record in sync even when the
 * teacher closed her browser, and pushes the news to her devices.
 */
export async function POST(req: Request) {
  if (!callbackAuthorized(req.headers)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    sessionId?: string;
    status?: RecordingStatus;
    stage?: string;
    progress?: number;
    durationSec?: number | null;
    sizeBytes?: number | null;
    error?: string | null;
  };
  if (!body.sessionId || !body.status) {
    return NextResponse.json({ error: "sessionId and status are required" }, { status: 400 });
  }

  const row = await db.recordingSession.findUnique({ where: { id: body.sessionId } });
  if (!row) return NextResponse.json({ ok: true, ignored: true });

  const updated = await db.recordingSession.update({
    where: { id: row.id },
    data: {
      status: body.status,
      stage: body.stage ?? row.stage,
      progress: Math.max(0, Math.min(100, Math.round(body.progress ?? row.progress))),
      durationSec: body.durationSec ?? row.durationSec,
      sizeBytes: body.sizeBytes ?? row.sizeBytes,
      hasVideo: body.status === "READY" ? true : row.hasVideo,
      errorMessage: body.error ?? null,
      finalizedAt: row.finalizedAt ?? (body.status === "PROCESSING" ? new Date() : null),
      readyAt: body.status === "READY" ? (row.readyAt ?? new Date()) : row.readyAt,
    },
  });

  // Let her know even if she closed the studio tab.
  if (body.status === "READY" || body.status === "FAILED") {
    const { sendPushToUsers } = await import("@/lib/push");
    await sendPushToUsers([updated.teacherId], {
      title: body.status === "READY" ? "🎬 تسجيل الحصة جاهز" : "⚠️ فشل تجهيز التسجيل",
      body:
        body.status === "READY"
          ? `«${updated.title}» جاهز للمشاهدة والربط بالدرس`
          : `«${updated.title}» — ${updated.errorMessage ?? "حاولي مرة أخرى"}`,
      url: `/admin/recordings`,
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
