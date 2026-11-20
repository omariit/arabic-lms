import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canViewRecording } from "@/lib/recording-access";
import { mintTokens, recordingConfigured } from "@/lib/recording";

/**
 * Thumbnail of a finished recording. Same access rules as the video, and the
 * same redirect strategy: the browser fetches the JPEG straight from the
 * recording service with a short-lived, session-scoped token.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const rec = await db.recordingSession.findUnique({
    where: { id },
    include: { lesson: { select: { module: { select: { courseId: true } }, access: true } } },
  });
  if (!rec || !rec.hasVideo) return NextResponse.json({ error: "لا يوجد تسجيل" }, { status: 404 });

  let enrolled = false;
  if (user.role === "STUDENT" && rec.lesson) {
    const found = await db.enrollment.findFirst({
      where: { userId: user.id, courseId: rec.lesson.module.courseId, status: "ACTIVE" },
      select: { id: true },
    });
    enrolled = Boolean(found);
  }
  const allowed = canViewRecording({
    role: user.role,
    userId: user.id,
    teacherId: rec.teacherId,
    lesson: rec.lesson ? { access: rec.lesson.access } : null,
    enrolled,
  });
  if (!allowed) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  if (!recordingConfigured()) return NextResponse.json({ error: "خدمة التسجيل غير مفعّلة" }, { status: 503 });

  const { token } = await mintTokens(rec.serviceId, 60 * 60);
  const base = (process.env.RECORDING_SERVICE_URL ?? "").replace(/\/+$/, "");
  const res = NextResponse.redirect(
    `${base}/sessions/${rec.serviceId}/thumbnail.jpg?t=${encodeURIComponent(token)}`,
    307,
  );
  res.headers.set("cache-control", "private, no-store");
  return res;
}
