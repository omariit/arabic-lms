import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";

/** Staff: messages of a conversation (marks staffUnread = 0 = student messages read). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await apiUser("STAFF");
  if (error) return error;
  const { id } = await params;
  const conv = await db.conversation.findUnique({ where: { id } });
  if (!conv) return NextResponse.json({ error: "غير موجودة" }, { status: 404 });

  const [messages] = await Promise.all([
    db.message.findMany({ where: { conversationId: id }, orderBy: { createdAt: "asc" } }),
    db.conversation.update({ where: { id }, data: { staffUnread: 0 } }),
  ]);
  return NextResponse.json({ messages });
}

/** Staff: reply to a conversation. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await apiUser("STAFF");
  if (error) return error;
  const { id } = await params;
  const conv = await db.conversation.findUnique({ where: { id } });
  if (!conv) return NextResponse.json({ error: "غير موجودة" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { body?: string };
  const text = (body.body ?? "").trim();
  if (!text || text.length > 2000) return NextResponse.json({ error: "الرسالة فارغة أو طويلة" }, { status: 400 });

  const message = await db.message.create({
    data: { conversationId: id, senderId: user.id, senderRole: user.role, body: text },
  });
  // replying implicitly claims the conversation when nobody handles it yet
  await db.conversation.update({
    where: { id },
    data: {
      lastMessageAt: new Date(),
      studentUnread: { increment: 1 },
      ...(conv.assignedToId ? {} : { assignedToId: user.id }),
    },
  });
  return NextResponse.json({ message });
}

/** Staff: assign / unassign the conversation handler. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await apiUser("STAFF");
  if (error) return error;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { assignedToId?: string | null };
  await db.conversation.update({ where: { id }, data: { assignedToId: body.assignedToId || null } });
  return NextResponse.json({ ok: true });
}
