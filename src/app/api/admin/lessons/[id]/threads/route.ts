import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";

/**
 * Staff inbox for one lesson:
 * GET — assignment fields + every student's thread (name, unread, preview).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await apiUser("TEACHER");
  if (error) return error;
  const { id } = await params;

  const lesson = await db.lesson.findUnique({
    where: { id },
    select: {
      id: true, title: true, description: true, scriptText: true,
      assignmentTitle: true, assignmentInstructions: true,
      module: { select: { course: { select: { id: true, title: true } } } },
    },
  });
  if (!lesson) return NextResponse.json({ error: "غير موجود" }, { status: 404 });

  const threads = await db.lessonThread.findMany({
    where: { lessonId: id },
    orderBy: { lastMessageAt: "desc" },
    include: {
      student: { select: { fullName: true, phone: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  return NextResponse.json({
    lesson,
    threads: threads.map((t) => ({
      id: t.id,
      studentId: t.studentId,
      studentName: t.student.fullName,
      studentPhone: t.student.phone,
      staffUnread: t.staffUnread,
      studentUnread: t.studentUnread,
      assignedToId: t.assignedToId,
      lastMessageAt: t.lastMessageAt,
      preview: t.messages[0]?.body?.slice(0, 80) ?? "",
      hasVoice: !!t.messages[0]?.audioKey,
      previewRole: t.messages[0]?.senderRole ?? null,
    })),
  });
}
