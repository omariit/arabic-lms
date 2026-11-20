import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { presignGet, r2Configured } from "@/lib/r2";

/**
 * Meeting bootstrap info, used by the room page (registered + guest entry).
 * Public by design: it only exposes what an invited guest already knows, and it
 * NEVER returns the invite token itself — the page receives it from the URL.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const invite = url.searchParams.get("invite") ?? "";
  const live = await db.liveSession.findUnique({
    where: { id },
    include: {
      course: { select: { id: true, title: true } },
      chatMessages: { orderBy: { createdAt: "desc" }, take: 60 },
      _count: { select: { attendanceLogs: true } },
    },
  });
  if (!live) return NextResponse.json({ error: "الحصة غير موجودة" }, { status: 404 });

  const user = await getCurrentUser();
  const staff = user ? user.role !== "STUDENT" : false;
  const guestAuthorized = Boolean(invite) && invite === live.inviteToken && live.guestAllowed;

  let enrolled = false;
  if (user?.role === "STUDENT") {
    const e = await db.enrollment.findFirst({
      where: { userId: user.id, courseId: live.courseId, status: "ACTIVE" },
      select: { id: true },
    });
    enrolled = Boolean(e);
  }
  // Only an authenticated participant of this room may stream chat voice notes.
  const canHearVoice = staff || enrolled || guestAuthorized;

  const chat = await Promise.all(
    [...live.chatMessages].reverse().map(async (m) => ({
      id: m.id,
      authorName: m.authorName,
      authorRole: m.authorRole,
      body: m.body,
      createdAt: m.createdAt,
      audioUrl: m.audioKey && canHearVoice && r2Configured() ? await presignGet(m.audioKey, 600) : null,
      hasAudio: Boolean(m.audioKey),
    })),
  );

  return NextResponse.json({
    live: {
      id: live.id,
      title: live.title,
      mode: live.mode,
      status: live.status,
      courseId: live.courseId,
      courseTitle: live.course.title,
      guestAllowed: live.guestAllowed,
      maxSeats: live.maxSeats,
      attendees: live._count.attendanceLogs,
      inviteValid: guestAuthorized,
    },
    viewer: user ? { id: user.id, name: user.fullName, role: user.role, enrolled } : null,
    chat,
  });
}
