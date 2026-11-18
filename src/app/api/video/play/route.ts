import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { decodeToken } from "@/lib/crypto";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

/**
 * Exchange a 60-second signed grant for the actual YouTube embed source.
 * The grant is one-time use (nonce tracked server-side) and re-validates the
 * enrollment at the moment of playback, so captured grants are worthless after
 * 60 seconds even if leaked.
 */
const consumedNonces = new Map<string, number>();
function consumeNonce(nonce: string): boolean {
  const now = Date.now();
  if (consumedNonces.has(nonce)) return false;
  consumedNonces.set(nonce, now);
  for (const [k, t] of consumedNonces) if (now - t > 120_000) consumedNonces.delete(k);
  return true;
}

export async function POST(req: Request) {
  const { user, error } = await apiUser("STUDENT");
  if (error) return error;

  const rl = rateLimit(`videoplay:${user.id}`, 60, 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  const { grant } = (await req.json().catch(() => ({}))) as { grant?: string };
  const payload = grant ? decodeToken<{ lessonId?: string; liveSessionId?: string; uid: string; jti: string; exp: number }>(grant) : null;
  if (!payload || payload.uid !== user.id || !consumeNonce(payload.jti)) {
    return NextResponse.json({ error: "رمز التشغيل غير صالح أو منتهي" }, { status: 403 });
  }

  if (payload.liveSessionId) {
    const live = await db.liveSession.findUnique({ where: { id: payload.liveSessionId }, include: { course: true } });
    if (!live || live.status !== "LIVE" || !live.youtubeVideoId) {
      return NextResponse.json({ error: "الحصة المباشرة غير منعقدة حاليًا" }, { status: 403 });
    }
    const enrollment = await db.enrollment.findFirst({
      where: { userId: user.id, courseId: live.courseId, status: "ACTIVE" },
    });
    if (!enrollment && user.role !== "ADMIN") {
      return NextResponse.json({ error: "يجب التسجيل في الدورة أولًا" }, { status: 403 });
    }
    return NextResponse.json({
      source: { provider: "youtube" as const, videoId: live.youtubeVideoId, title: live.title, expiresAt: payload.exp },
    });
  }

  const lesson = await db.lesson.findUnique({
    where: { id: payload.lessonId },
    include: { module: { include: { course: true } } },
  });
  if (!lesson) return NextResponse.json({ error: "الدرس غير موجود" }, { status: 404 });

  if (lesson.access !== "FREE_PREVIEW") {
    const enrollment = await db.enrollment.findFirst({
      where: { userId: user.id, courseId: lesson.module.courseId, status: "ACTIVE" },
    });
    if (!enrollment) return NextResponse.json({ error: "يجب التسجيل في الدورة أولًا" }, { status: 403 });
  }

  return NextResponse.json({
    source: {
      provider: "youtube" as const,
      videoId: lesson.youtubeId, // raw ID, delivered only now, over an authenticated POST
      title: lesson.title,
      expiresAt: payload.exp,
    },
  });
}
