import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { sendPushToUsers } from "@/lib/push";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

/**
 * In-house video meeting — created by the teacher, no YouTube / no external service.
 * POST { courseId?, title?, guestAllowed? } → creates a LIVE MEETING room with a public invite token.
 */
export async function POST(req: Request) {
  const { user, error } = await apiUser("TEACHER");
  if (error) return error;

  const rl = rateLimit(`meetnew:${user.id}`, 10, 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  const body = (await req.json().catch(() => ({}))) as {
    courseId?: string; title?: string; guestAllowed?: boolean;
  };
  if (!body.courseId) return NextResponse.json({ error: "اختاري الدورة أولًا" }, { status: 400 });

  const course = await db.course.findUnique({ where: { id: body.courseId } });
  if (!course) return NextResponse.json({ error: "الدورة غير موجودة" }, { status: 404 });

  // Close any meeting left running for this course so students always land in the newest room.
  await db.liveSession.updateMany({
    where: { courseId: course.id, mode: "MEETING", status: "LIVE" },
    data: { status: "ENDED", endedAt: new Date() },
  });

  const title = (body.title ?? "").trim() || `حصة مباشرة: ${course.title}`;
  const live = await db.liveSession.create({
    data: {
      courseId: course.id,
      title,
      mode: "MEETING",
      status: "LIVE",
      startedAt: new Date(),
      inviteToken: randomBytes(18).toString("base64url"),
      guestAllowed: body.guestAllowed !== false,
      maxSeats: 12,
    },
  });

  // 🔔 notify enrolled students
  const enrolled = await db.enrollment.findMany({
    where: { courseId: course.id, status: "ACTIVE" },
    select: { userId: true },
  });
  sendPushToUsers(
    enrolled.map((e) => e.userId),
    { title: "🔴 بدأت الحصة المباشرة", body: `${title} — انضمي الآن`, url: `/live/${live.id}`, tag: `live-${live.id}` },
  ).catch(() => {});

  return NextResponse.json({
    ok: true,
    liveSessionId: live.id,
    classroomUrl: `/live/${live.id}`,
    inviteUrl: `/live/${live.id}?invite=${live.inviteToken}`,
    inviteToken: live.inviteToken,
    guestAllowed: live.guestAllowed,
  });
}

/** Toggle guest access / rotate the invite link (teacher only). */
export async function PATCH(req: Request) {
  const { error } = await apiUser("TEACHER");
  if (error) return error;
  const body = (await req.json().catch(() => ({}))) as {
    liveSessionId?: string; guestAllowed?: boolean; rotateInvite?: boolean; end?: boolean;
  };
  if (!body.liveSessionId) return NextResponse.json({ error: "liveSessionId مطلوب" }, { status: 400 });
  const live = await db.liveSession.findUnique({ where: { id: body.liveSessionId } });
  if (!live) return NextResponse.json({ error: "غير موجودة" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (typeof body.guestAllowed === "boolean") data.guestAllowed = body.guestAllowed;
  if (body.rotateInvite) data.inviteToken = randomBytes(18).toString("base64url");
  if (body.end) {
    data.status = "ENDED";
    data.endedAt = new Date();
  }
  const updated = await db.liveSession.update({ where: { id: live.id }, data });
  return NextResponse.json({
    ok: true,
    guestAllowed: updated.guestAllowed,
    inviteToken: updated.inviteToken,
    status: updated.status,
  });
}
