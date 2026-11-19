import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { sendPushToUsers } from "@/lib/push";

/**
 * Staff ↔ one student inside a lesson thread.
 * GET  — full message history (marks staffUnread = 0).
 * POST — reply (text and/or voice note key). Marks studentUnread +1 and notifies her.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; studentId: string }> }) {
  const { error } = await apiUser("TEACHER");
  if (error) return error;
  const { id, studentId } = await params;

  const thread = await db.lessonThread.findUnique({ where: { lessonId_studentId: { lessonId: id, studentId } } });
  if (!thread) return NextResponse.json({ error: "غير موجودة" }, { status: 404 });

  const [messages] = await Promise.all([
    db.lessonMessage.findMany({ where: { threadId: thread.id }, orderBy: { createdAt: "asc" } }),
    db.lessonThread.update({ where: { id: thread.id }, data: { staffUnread: 0 } }),
  ]);
  return NextResponse.json({ messages });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string; studentId: string }> }) {
  const { user, error } = await apiUser("TEACHER");
  if (error) return error;
  const { id, studentId } = await params;

  const thread = await db.lessonThread.findUnique({ where: { lessonId_studentId: { lessonId: id, studentId } } });
  if (!thread) return NextResponse.json({ error: "غير موجودة" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { body?: string; audioKey?: string; audioMime?: string };
  const text = (body.body ?? "").trim();
  if (!text && !body.audioKey) return NextResponse.json({ error: "الرسالة فارغة" }, { status: 400 });
  if (text.length > 4000) return NextResponse.json({ error: "النص طويل جدًا" }, { status: 400 });

  const message = await db.lessonMessage.create({
    data: {
      threadId: thread.id,
      senderId: user.id,
      senderRole: user.role,
      body: text,
      audioKey: body.audioKey || null,
      audioMime: body.audioMime || null,
    },
  });
  await db.lessonThread.update({
    where: { id: thread.id },
    data: { lastMessageAt: new Date(), studentUnread: { increment: 1 }, ...(thread.assignedToId ? {} : { assignedToId: user.id }) },
  });

  // 🔔 notify the student
  sendPushToUsers([thread.studentId], {
    title: "💬 تصحيح/رد على واجب الدرس",
    body: text.slice(0, 80),
    url: `/lesson/${id}`,
    tag: `lesson-${id}`,
  }).catch(() => {});

  return NextResponse.json({ message });
}
