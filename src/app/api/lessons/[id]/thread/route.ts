import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { sendPushToUsers } from "@/lib/push";
import { verifyUpload } from "@/lib/r2";

/**
 * Student's private lesson thread (assignment conversation with the teacher's team).
 * GET  — my messages + assignment info. The thread is created lazily on first access.
 * POST — send a message (text and/or uploaded voice note key).
 */
async function ownThread(lessonId: string, studentId: string, create: boolean) {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true, title: true, assignmentTitle: true, assignmentInstructions: true,
      module: { select: { courseId: true } },
    },
  });
  if (!lesson) return { lesson: null, thread: null };

  // must be enrolled in the course
  const enrolled = await db.enrollment.findFirst({
    where: { userId: studentId, courseId: lesson.module.courseId, status: "ACTIVE" },
  });
  if (!enrolled) return { lesson: null, thread: null };

  let thread = await db.lessonThread.findUnique({ where: { lessonId_studentId: { lessonId, studentId } } });
  if (!thread && create) {
    thread = await db.lessonThread.create({ data: { lessonId, studentId } });
  }
  return { lesson, thread };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await apiUser("STUDENT");
  if (error) return error;
  const { id } = await params;
  const { lesson, thread } = await ownThread(id, user.id, true);
  if (!lesson) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });

  const messages = thread
    ? await db.lessonMessage.findMany({ where: { threadId: thread.id }, orderBy: { createdAt: "asc" } })
    : [];
  if (thread && thread.studentUnread > 0) {
    await db.lessonThread.update({ where: { id: thread.id }, data: { studentUnread: 0 } });
  }
  return NextResponse.json({
    assignment: lesson.assignmentTitle
      ? { title: lesson.assignmentTitle, instructions: lesson.assignmentInstructions }
      : null,
    messages,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await apiUser("STUDENT");
  if (error) return error;
  const { id } = await params;
  const { thread } = await ownThread(id, user.id, true);
  if (!thread) return NextResponse.json({ error: "غير مصرح" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { body?: string; audioKey?: string; audioMime?: string };
  const text = (body.body ?? "").trim();
  if (!text && !body.audioKey) return NextResponse.json({ error: "الرسالة فارغة" }, { status: 400 });
  if (text.length > 4000) return NextResponse.json({ error: "النص طويل جدًا" }, { status: 400 });

  // The recording was uploaded straight to R2; only its key reaches us.
  const check = await verifyUpload(body.audioKey, "submission", user.id);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  const message = await db.lessonMessage.create({
    data: {
      threadId: thread.id,
      senderId: user.id,
      senderRole: "STUDENT",
      body: text,
      audioKey: body.audioKey || null,
      audioMime: body.audioMime || null,
    },
  });
  await db.lessonThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date(), staffUnread: { increment: 1 } } });

  // 🔔 notify staff
  const staffIds = thread.assignedToId
    ? [thread.assignedToId]
    : (await db.user.findMany({ where: { role: { in: ["TEACHER", "ADMIN", "ASSISTANT"] } }, select: { id: true } })).map((u) => u.id);
  sendPushToUsers(staffIds, {
    title: "📝 تسليم/رسالة على واجب الدرس",
    body: `${user.fullName}`,
    url: `/admin/lessons/${id}`,
    tag: `lesson-${id}`,
  }).catch(() => {});

  return NextResponse.json({ message });
}
