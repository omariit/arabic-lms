import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

/** Live classroom bootstrap: enrollment-gated session + protected video info. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await apiUser("any");
  if (error) return error;

  const { id } = await params;
  const live = await db.liveSession.findUnique({
    where: { id },
    include: { course: { select: { id: true, title: true } } },
  });
  if (!live) return NextResponse.json({ error: "الحصة غير موجودة" }, { status: 404 });

  // Staff run the room, so they are not required to be enrolled themselves.
  const isStaff = user.role !== "STUDENT";
  if (!isStaff) {
    const enrollment = await db.enrollment.findFirst({
      where: { userId: user.id, courseId: live.courseId, status: "ACTIVE" },
    });
    if (!enrollment) return NextResponse.json({ error: "يجب التسجيل في الدورة" }, { status: 403 });
  }

  const rl = rateLimit(`liveinfo:${user.id}`, 60, 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  return NextResponse.json({
    live: {
      id: live.id, title: live.title, status: live.status,
      startedAt: live.startedAt, endedAt: live.endedAt,
      courseId: live.courseId, courseTitle: live.course.title,
    },
    viewer: { role: user.role, name: user.fullName, phone: user.phone },
  });
}
