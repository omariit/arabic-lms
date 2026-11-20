import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canViewRecording } from "@/lib/recording-access";
import { mintTokens, recordingConfigured } from "@/lib/recording";

/**
 * Protected playback proxy for a finished lesson recording.
 *
 * Access: staff (teacher/admin) — or a student enrolled in the lesson's course.
 * The browser never sees RECORDING_SERVICE_URL or its secret: this route mints a
 * short-lived view token and pipes the MP4 (with Range support) back.
 */
async function serve(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
  kind: "video" | "thumbnail",
) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const rec = await db.recordingSession.findUnique({
    where: { id },
    include: { lesson: { select: { id: true, module: { select: { courseId: true } }, access: true } } },
  });
  if (!rec || !rec.hasVideo) return NextResponse.json({ error: "التسجيل غير متاح" }, { status: 404 });

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

  // Hand playback to the recording service with a short-lived, session-scoped
  // token instead of piping gigabytes through the Next.js server: the service
  // already supports HTTP Range, so seeking works and the app stays cheap.
  const { token } = await mintTokens(rec.serviceId, 30 * 60);
  const base = (process.env.RECORDING_SERVICE_URL ?? "").replace(/\/+$/, "");
  const file = kind === "video" ? "video.mp4" : "thumbnail.jpg";
  const target = `${base}/sessions/${rec.serviceId}/${file}?t=${encodeURIComponent(token)}`;

  const res = NextResponse.redirect(target, 307);
  res.headers.set("cache-control", "private, no-store");
  res.headers.set("x-recording-id", rec.id);
  return res;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return serve(req, ctx, "video");
}

export async function HEAD(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const res = await serve(req, ctx, "video");
  return new Response(null, { status: res.status, headers: res.headers });
}
