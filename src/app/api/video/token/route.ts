import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { encodeToken } from "@/lib/crypto";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

/**
 * Short-lived (60s) signed video grant.
 * Verifies: active session (with device match enforced by auth layer),
 * active enrollment, and rate limits. The lesson's raw YouTube ID is never
 * returned — only a signed payload with a one-time nonce that the player
 * exchanges server-side.
 */
export async function POST(req: Request) {
  const { user, error } = await apiUser("STUDENT");
  if (error) return error;

  const body = (await req.json().catch(() => ({}))) as { lessonId?: string; liveSessionId?: string };
  const lessonId = body.lessonId;
  const liveSessionId = body.liveSessionId;
  if (!lessonId && !liveSessionId) return NextResponse.json({ error: "lessonId أو liveSessionId مطلوب" }, { status: 400 });

  const rl = rateLimit(`videotoken:${user.id}`, 30, 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  if (liveSessionId) {
    const live = await db.liveSession.findUnique({ where: { id: liveSessionId }, include: { course: true } });
    if (!live || live.status !== "LIVE" || !live.youtubeVideoId) {
      return NextResponse.json({ error: "الحصة المباشرة غير منعقدة حاليًا" }, { status: 403 });
    }
    const enrollment = await db.enrollment.findFirst({
      where: { userId: user.id, courseId: live.courseId, status: "ACTIVE" },
    });
    if (!enrollment && user.role !== "ADMIN") {
      return NextResponse.json({ error: "يجب التسجيل في الدورة أولًا" }, { status: 403 });
    }
    const grant = encodeToken({ liveSessionId: live.id, uid: user.id }, 60);
    return NextResponse.json({ grant, expiresIn: 60 });
  }

  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: { module: { include: { course: true } } },
  });
  if (!lesson) return NextResponse.json({ error: "الدرس غير موجود" }, { status: 404 });

  // Free previews skip enrollment; everything else requires ACTIVE enrollment.
  if (lesson.access !== "FREE_PREVIEW") {
    const enrollment = await db.enrollment.findFirst({
      where: { userId: user.id, courseId: lesson.module.courseId, status: "ACTIVE" },
    });
    if (!enrollment) return NextResponse.json({ error: "يجب التسجيل في الدورة أولًا" }, { status: 403 });
  }

  // Grant never contains the YouTube ID itself — the server resolves it at playback.
  const grant = encodeToken({ lessonId: lesson.id, uid: user.id }, 60);
  return NextResponse.json({ grant, expiresIn: 60 });
}
