import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { recordingView } from "@/lib/recording";

/**
 * Staff: attach a finished recording to a lesson (students then see it inside the
 * lesson page next to the protected YouTube player). One recording per lesson.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await apiUser("STAFF");
  if (error || !user) return error!;
  const { id } = await ctx.params;

  const row = await db.recordingSession.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "التسجيل غير موجود" }, { status: 404 });
  if (user.role !== "ADMIN" && row.teacherId !== user.id) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { lessonId?: string | null };
  if (!body.lessonId) {
    await db.recordingSession.update({ where: { id }, data: { lessonId: null } });
    const detached = await db.recordingSession.findUnique({ where: { id } });
    return NextResponse.json({ ok: true, recording: recordingView(detached!) });
  }

  const lesson = await db.lesson.findUnique({
    where: { id: body.lessonId },
    select: { id: true, title: true, module: { select: { courseId: true } } },
  });
  if (!lesson) return NextResponse.json({ error: "الدرس غير موجود" }, { status: 404 });

  const taken = await db.recordingSession.findUnique({ where: { lessonId: lesson.id } });
  if (taken && taken.id !== id) {
    return NextResponse.json({ error: "هذا الدرس مرتبط بتسجيل آخر" }, { status: 409 });
  }

  const updated = await db.recordingSession.update({
    where: { id },
    data: { lessonId: lesson.id, courseId: lesson.module.courseId, title: row.title },
  });
  return NextResponse.json({ ok: true, recording: recordingView(updated), lessonTitle: lesson.title });
}
