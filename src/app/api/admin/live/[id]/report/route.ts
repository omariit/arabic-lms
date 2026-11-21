import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { attendanceDuration } from "@/lib/live-poll";

/**
 * The teacher's record of one live lecture: who attended, and every question she
 * asked with the answers, the right answer and — most importantly — who did not
 * answer, so she can follow up.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await apiUser("STAFF");
  if (error || !user) return error!;
  if (user.role === "ASSISTANT") {
    return NextResponse.json({ error: "تقرير الحصة للمعلمة والإدارة فقط" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const live = await db.liveSession.findUnique({
    where: { id },
    include: {
      course: { select: { id: true, title: true } },
      attendanceLogs: { include: { user: { select: { id: true, fullName: true } } }, orderBy: { joinedAt: "asc" } },
      polls: { orderBy: { createdAt: "asc" }, include: { answers: true } },
    },
  });
  if (!live) return NextResponse.json({ error: "الحصة غير موجودة" }, { status: 404 });

  const enrolled = await db.enrollment.findMany({
    where: { courseId: live.courseId, user: { role: "STUDENT" } },
    select: { user: { select: { id: true, fullName: true } } },
    orderBy: { createdAt: "asc" },
  });

  const attendance = live.attendanceLogs.map((log) => ({
    id: log.id,
    userId: log.userId,
    name: log.user.fullName,
    joinedAt: log.joinedAt,
    leftAt: log.leftAt,
    seconds: attendanceDuration(log.joinedAt, log.leftAt),
  }));

  const presentIds = new Set(attendance.map((a) => a.userId));
  const absent = enrolled
    .filter((e) => !presentIds.has(e.user.id))
    .map((e) => ({ userId: e.user.id, name: e.user.fullName }));

  const polls = live.polls.map((p) => {
    const options = Array.isArray(p.options) ? (p.options as string[]) : [];
    const counts = options.map((_, i) => p.answers.filter((a) => a.optionIndex === i).length);
    const answeredIds = new Set(p.answers.map((a) => a.userId).filter(Boolean) as string[]);
    return {
      id: p.id,
      question: p.question,
      options,
      counts,
      total: p.answers.length,
      correctIndex: p.correctIndex,
      status: p.status,
      createdAt: p.createdAt,
      closedAt: p.closedAt,
      answers: p.answers.map((a) => ({
        userId: a.userId,
        name: a.userId
          ? attendance.find((x) => x.userId === a.userId)?.name ??
            enrolled.find((e) => e.user.id === a.userId)?.user.fullName ??
            "طالبة"
          : a.guestName ?? "ضيفة",
        optionIndex: a.optionIndex,
        correct: p.correctIndex === null ? null : a.optionIndex === p.correctIndex,
      })),
      missing: enrolled
        .filter((e) => !answeredIds.has(e.user.id))
        .map((e) => ({ userId: e.user.id, name: e.user.fullName })),
    };
  });

  return NextResponse.json({
    live: {
      id: live.id,
      title: live.title,
      status: live.status,
      startedAt: live.startedAt,
      endedAt: live.endedAt,
      course: live.course,
    },
    attendance,
    absent,
    enrolled: enrolled.length,
    polls,
  });
}
