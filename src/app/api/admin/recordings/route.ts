import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { clientMeta } from "@/lib/auth";
import { ACTIVE_STATUSES, createRemoteSession, fetchRemoteState, recordingConfigured, recordingView, syncRecording } from "@/lib/recording";

/** Staff: list recording sessions (teacher sees her own, admin sees everyone). */
export async function GET() {
  const { user, error } = await apiUser("STAFF");
  if (error || !user) return error!;

  const rows = await db.recordingSession.findMany({
    where: user.role === "ADMIN" ? {} : { teacherId: user.id },
    orderBy: { startedAt: "desc" },
    take: 60,
    include: {
      lesson: { select: { id: true, title: true } },
      course: { select: { id: true, title: true } },
      teacher: { select: { fullName: true } },
    },
  });

  // Refresh anything still in flight so the list never shows stale progress.
  const synced = await Promise.all(
    rows.map(async (row) => {
      const labels = {
        courseTitle: row.course?.title ?? null,
        lessonTitle: row.lesson?.title ?? null,
        teacherName: row.teacher?.fullName ?? null,
      };
      if (!ACTIVE_STATUSES.includes(row.status) || !recordingConfigured()) return { row, labels };
      try {
        // Short timeout, no retries: a sleeping service must not make the list
        // slow — the DB row is still shown as-is, and the row's own page retries.
        const { state } = await fetchRemoteState(row.serviceId, 3500);
        return { row: await syncRecording(row, state), labels };
      } catch {
        return { row, labels };
      }
    }),
  );

  return NextResponse.json({
    configured: recordingConfigured(),
    recordings: synced.map(({ row, labels }) => ({ ...recordingView(row), ...labels })),
  });
}

/** Staff: start a new recording session (creates the service session + DB row). */
export async function POST(req: Request) {
  const { user, error } = await apiUser("STAFF");
  if (error || !user) return error!;
  if (user.role === "ASSISTANT") {
    return NextResponse.json({ error: "التسجيل متاح للمعلمة والإدارة فقط" }, { status: 403 });
  }
  const { ip } = await clientMeta();
  const rl = rateLimit(`recording-create:${user.id}:${ip}`, 20, 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  if (!recordingConfigured()) {
    return NextResponse.json(
      { error: "خدمة التسجيل غير مفعّلة على هذا الخادم — راجعي docs/recording.md" },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { title?: string; courseId?: string; lessonId?: string };
  const title = (body.title ?? "").trim().slice(0, 140) || "تسجيل حصة";
  const lessonId = body.lessonId || null;
  const courseId = body.courseId || null;

  if (lessonId) {
    const existing = await db.recordingSession.findUnique({ where: { lessonId } });
    if (existing) {
      return NextResponse.json({ error: "هذا الدرس عنده تسجيل بالفعل — احذفيه أو اختاري درسًا آخر", id: existing.id }, { status: 409 });
    }
  }

  // One cuid identifies the session on both sides: our row id *is* the service id,
  // which keeps logs, callbacks and support requests trivially traceable.
  const id = randomUUID().replace(/-/g, "");
  const row = await db.recordingSession.create({
    data: { id, serviceId: id, title, teacherId: user.id, courseId, lessonId, status: "RECORDING", stage: "created" },
  });

  try {
    const created = await createRemoteSession({
      sessionId: row.id,
      title,
      lessonId,
      courseId,
      teacherId: user.id,
    });
    return NextResponse.json({
      id: row.id,
      serviceId: created.sessionId,
      uploadToken: created.uploadToken,
      state: created.state,
      recording: recordingView(row),
    });
  } catch (e) {
    await db.recordingSession.delete({ where: { id: row.id } }).catch(() => {});
    const message = e instanceof Error ? e.message : "تعذّر بدء الجلسة";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
