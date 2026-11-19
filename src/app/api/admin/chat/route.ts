import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";

/** Staff (TEACHER/ADMIN/ASSISTANT): inbox — all conversations with student info + unread counts. */
export async function GET() {
  const { user, error } = await apiUser("STAFF");
  if (error) return error;

  const conversations = await db.conversation.findMany({
    orderBy: { lastMessageAt: "desc" },
    take: 200,
    include: {
      student: { select: { fullName: true, phone: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const staff = await db.user.findMany({
    where: { role: { in: ["TEACHER", "ADMIN", "ASSISTANT"] } },
    select: { id: true, fullName: true, role: true },
  });

  return NextResponse.json({
    me: { id: user.id, fullName: user.fullName, role: user.role },
    staff,
    conversations: conversations.map((c) => ({
      id: c.id,
      studentName: c.student.fullName,
      studentPhone: c.student.phone,
      subject: c.subject,
      lastMessageAt: c.lastMessageAt,
      unread: c.staffUnread,
      assignedToId: c.assignedToId,
      preview: c.messages[0]?.body?.slice(0, 80) ?? "",
      previewRole: c.messages[0]?.senderRole ?? null,
    })),
  });
}
