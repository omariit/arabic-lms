import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { createLiveBroadcast, broadcastAppUrl, endLiveBroadcast } from "@/lib/youtube";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

/**
 * One-Click Mobile Live Launcher (teacher only):
 * POST { courseId, title, scheduledAt? }
 * 1. Creates an Unlisted + embeddable YouTube broadcast & bound stream via the
 *    teacher's stored OAuth refresh token (she never touches YouTube manually).
 * 2. Saves videoId on the LiveSession, marks it LIVE, unlocking the classroom.
 * 3. Returns a single deep link that opens her YouTube broadcast screen.
 */
export async function POST(req: Request) {
  const { user, error } = await apiUser("TEACHER");
  if (error) return error;

  const rl = rateLimit(`livego:${user.id}`, 10, 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  const body = (await req.json().catch(() => ({}))) as {
    courseId?: string; title?: string; scheduledAt?: string;
  };
  if (!body.courseId) return NextResponse.json({ error: "courseId مطلوب" }, { status: 400 });

  const course = await db.course.findUnique({ where: { id: body.courseId } });
  if (!course) return NextResponse.json({ error: "الدورة غير موجودة" }, { status: 404 });

  const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : new Date();

  let broadcast;
  try {
    broadcast = await createLiveBroadcast(body.title || `حصة مباشرة: ${course.title}`, scheduledAt);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    if (msg === "TEACHER_OAUTH_MISSING") {
      return NextResponse.json(
        { error: "يجب ربط قناة يوتيوب أولًا من صفحة الإعدادات", code: "OAUTH_MISSING" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: `تعذّر إنشاء البث: ${msg}` }, { status: 502 });
  }

  const live = await db.liveSession.create({
    data: {
      courseId: course.id,
      title: body.title || `حصة مباشرة: ${course.title}`,
      scheduledAt,
      youtubeVideoId: broadcast.videoId,
      status: "LIVE",
      startedAt: new Date(),
    },
  });

  return NextResponse.json({
    ok: true,
    liveSessionId: live.id,
    videoId: broadcast.videoId,
    // Single deep-link button for her phone: opens YouTube app broadcast screen.
    youtubeAppUrl: broadcastAppUrl(broadcast.streamKey),
    classroomUrl: `/live/${live.id}`,
  });
}

/** End the class: transition the broadcast to complete + close the LiveSession. */
export async function DELETE(req: Request) {
  const { user, error } = await apiUser("TEACHER");
  if (error) return error;

  const { liveSessionId } = (await req.json().catch(() => ({}))) as { liveSessionId?: string };
  if (!liveSessionId) return NextResponse.json({ error: "liveSessionId مطلوب" }, { status: 400 });

  const live = await db.liveSession.findUnique({ where: { id: liveSessionId } });
  if (!live) return NextResponse.json({ error: "غير موجود" }, { status: 404 });
  if (live.youtubeVideoId) await endLiveBroadcast(live.youtubeVideoId);

  await db.liveSession.update({
    where: { id: live.id },
    data: { status: "ENDED", endedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
