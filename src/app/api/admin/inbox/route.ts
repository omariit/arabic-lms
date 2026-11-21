import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";

/**
 * One place for every lesson conversation across every course.
 *
 * Why it exists: student homework/voice notes were only visible inside
 * /admin/lessons/<lessonId>, which nobody navigates to by hand, and the unread
 * badge pointed at the student chat instead. Homework looked "lost".
 *
 * GET — all threads (unread first), grouped by course → lesson.
 * PATCH — mark one thread read (or all of them).
 */
export async function GET() {
  const { error } = await apiUser("STAFF");
  if (error) return error;

  const threads = await db.lessonThread.findMany({
    orderBy: [{ staffUnread: "desc" }, { lastMessageAt: "desc" }],
    take: 200,
    include: {
      student: { select: { fullName: true, phone: true } },
      lesson: {
        select: {
          id: true, title: true, assignmentTitle: true,
          module: { select: { course: { select: { id: true, title: true } } } },
        },
      },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const items = threads.map((t) => ({
    id: t.id,
    lessonId: t.lesson.id,
    lessonTitle: t.lesson.title,
    assignmentTitle: t.lesson.assignmentTitle ?? "",
    courseId: t.lesson.module.course.id,
    courseTitle: t.lesson.module.course.title,
    studentId: t.studentId,
    studentName: t.student.fullName,
    studentPhone: t.student.phone,
    staffUnread: t.staffUnread,
    lastMessageAt: t.lastMessageAt,
    preview: (t.messages[0]?.body ?? (t.messages[0]?.audioKey ? "🎤 تسجيل صوتي" : "")).slice(0, 90),
    lastFrom: t.messages[0]?.senderRole ?? null,
    hasVoice: !!t.messages[0]?.audioKey,
    messageCount: t.messages.length,
  }));

  return NextResponse.json({
    items,
    unreadTotal: items.reduce((n, i) => n + (i.staffUnread > 0 ? 1 : 0), 0),
    unreadMessages: items.reduce((n, i) => n + i.staffUnread, 0),
  });
}

export async function PATCH(req: Request) {
  const { error } = await apiUser("STAFF");
  if (error) return error;
  const body = (await req.json().catch(() => ({}))) as { threadId?: string; all?: boolean };

  if (body.all) {
    await db.lessonThread.updateMany({ where: { staffUnread: { gt: 0 } }, data: { staffUnread: 0 } });
    return NextResponse.json({ ok: true });
  }
  if (!body.threadId) return NextResponse.json({ error: "معرّف المحادثة مفقود" }, { status: 400 });
  await db.lessonThread.update({ where: { id: body.threadId }, data: { staffUnread: 0 } });
  return NextResponse.json({ ok: true });
}
