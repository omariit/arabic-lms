import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { sendPushToUsers } from "@/lib/push";
import { verifyUpload } from "@/lib/r2";

async function ownConversation(id: string, studentId: string) {
  const c = await db.conversation.findUnique({ where: { id } });
  return c && c.studentId === studentId ? c : null;
}

/** Student: messages of one of my conversations (marks thread read). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await apiUser("STUDENT");
  if (error) return error;
  const { id } = await params;
  const conv = await ownConversation(id, user.id);
  if (!conv) return NextResponse.json({ error: "غير موجودة" }, { status: 404 });

  const [messages] = await Promise.all([
    db.message.findMany({ where: { conversationId: id }, orderBy: { createdAt: "asc" } }),
    db.conversation.update({ where: { id }, data: { studentUnread: 0 } }),
  ]);
  return NextResponse.json({ messages });
}

/** Student: send a message. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await apiUser("STUDENT");
  if (error) return error;
  const { id } = await params;
  const conv = await ownConversation(id, user.id);
  if (!conv) return NextResponse.json({ error: "غير موجودة" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { body?: string; audioKey?: string; audioMime?: string };
  const text = (body.body ?? "").trim();
  if (!text && !body.audioKey) return NextResponse.json({ error: "الرسالة فارغة" }, { status: 400 });
  if (text.length > 2000) return NextResponse.json({ error: "النص طويل جدًا" }, { status: 400 });

  // Voice notes are uploaded browser → R2; validate the key before storing it.
  const check = await verifyUpload(body.audioKey, "submission", user.id);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  const message = await db.message.create({
    data: {
      conversationId: id, senderId: user.id, senderRole: "STUDENT", body: text,
      audioKey: body.audioKey || null, audioMime: body.audioMime || null,
    },
  });
  await db.conversation.update({ where: { id }, data: { lastMessageAt: new Date(), staffUnread: { increment: 1 } } });

  // 🔔 notify staff (assigned handler first, otherwise all staff)
  const staffIds = conv.assignedToId
    ? [conv.assignedToId]
    : (await db.user.findMany({ where: { role: { in: ["TEACHER", "ADMIN", "ASSISTANT"] } }, select: { id: true } })).map((u) => u.id);
  sendPushToUsers(staffIds, {
    title: "📨 رسالة جديدة من طالبة",
    body: text ? text.slice(0, 80) : "🎙 رسالة صوتية",
    url: "/admin/chat",
    tag: `chat-${id}`,
  }).catch(() => {});

  return NextResponse.json({ message });
}
