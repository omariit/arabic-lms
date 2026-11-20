import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";

/** Student: list my conversations (+ optional ?open=<id> marks that thread read). */
export async function GET(req: Request) {
  const { user, error } = await apiUser("STUDENT");
  if (error) return error;
  const url = new URL(req.url);
  const openId = url.searchParams.get("open");

  const conversations = await db.conversation.findMany({
    where: { studentId: user.id },
    orderBy: { lastMessageAt: "desc" },
    include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  if (openId && conversations.some((c) => c.id === openId)) {
    await db.conversation.update({ where: { id: openId }, data: { studentUnread: 0 } }).catch(() => {});
  }

  return NextResponse.json({
    conversations: conversations.map((c) => ({
      id: c.id,
      subject: c.subject,
      lastMessageAt: c.lastMessageAt,
      unread: c.studentUnread,
      assignedToId: c.assignedToId,
      preview: c.messages[0] ? (c.messages[0].body || "🎙 رسالة صوتية").slice(0, 80) : "",
      senderRole: c.messages[0]?.senderRole ?? null,
    })),
  });
}

/** Student: start a new conversation. */
export async function POST(req: Request) {
  const { user, error } = await apiUser("STUDENT");
  if (error) return error;
  const body = (await req.json().catch(() => ({}))) as { subject?: string };
  const conversation = await db.conversation.create({
    data: { studentId: user.id, subject: (body.subject ?? "").slice(0, 120) },
  });
  return NextResponse.json({ conversation });
}
