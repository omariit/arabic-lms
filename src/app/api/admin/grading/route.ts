import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { sendPushToUsers } from "@/lib/push";
import { r2Configured, newAudioKey, presignPut, presignGet } from "@/lib/r2";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

/**
 * Teacher grading endpoint (mobile voice feedback):
 * 1. GET  ?attemptId=... — grading queue data with presigned playback URLs.
 * 2. POST — assign grade, text notes, and optionally a teacher voice feedback note
 *    uploaded straight to R2 via a presigned PUT returned in the same response.
 */
export async function GET(req: Request) {
  const { user, error } = await apiUser("TEACHER");
  if (error) return error;

  const url = new URL(req.url);
  const attemptId = url.searchParams.get("attemptId");

  if (attemptId) {
    const attempt = await db.examAttempt.findUnique({
      where: { id: attemptId },
      include: {
        user: { select: { id: true, fullName: true, phone: true } },
        exam: { select: { id: true, title: true, type: true, maxGrade: true } },
        audioFiles: true,
      },
    });
    if (!attempt) return NextResponse.json({ error: "غير موجود" }, { status: 404 });
    if (!r2Configured()) return NextResponse.json({ error: "التخزين غير مهيأ" }, { status: 503 });

    const presigned = await Promise.all(
      attempt.audioFiles.map(async (a) => ({ id: a.id, url: await presignGet(a.audioKey, 600) }))
    );
    return NextResponse.json({ attempt, presigned });
  }

  // Voice grading queue: submitted voice attempts awaiting a grade.
  const queue = await db.examAttempt.findMany({
    where: { status: "SUBMITTED", exam: { type: "VOICE" } },
    include: {
      user: { select: { fullName: true, phone: true } },
      exam: { select: { title: true, maxGrade: true } },
      audioFiles: { select: { id: true, createdAt: true } },
    },
    orderBy: { submittedAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ queue });
}

export async function POST(req: Request) {
  const { user, error } = await apiUser("TEACHER");
  if (error) return error;

  const rl = rateLimit(`grade:${user.id}`, 40, 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  const body = (await req.json().catch(() => ({}))) as {
    attemptId?: string; manualGrade?: number; feedbackText?: string; voiceNoteKey?: string;
  };
  if (!body.attemptId) return NextResponse.json({ error: "attemptId مطلوب" }, { status: 400 });

  const attempt = await db.examAttempt.findUnique({
    where: { id: body.attemptId },
    include: { exam: true },
  });
  if (!attempt) return NextResponse.json({ error: "غير موجود" }, { status: 404 });

  const grade = body.manualGrade;
  if (grade !== undefined && (grade < 0 || grade > attempt.exam.maxGrade)) {
    return NextResponse.json({ error: `الدرجة يجب أن تكون بين 0 و ${attempt.exam.maxGrade}` }, { status: 400 });
  }

  // Optional: presign an upload for the teacher's voice feedback note (recorded in-phone).
  let voiceUpload: { uploadUrl: string; key: string } | null = null;
  if (body.voiceNoteKey === "NEW") {
    if (!r2Configured()) return NextResponse.json({ error: "التخزين غير مهيأ" }, { status: 503 });
    const key = newAudioKey("feedback", attempt.userId);
    const uploadUrl = await presignPut(key, "audio/mp4", 300);
    voiceUpload = { uploadUrl, key };
  }

  await db.examAttempt.update({
    where: { id: attempt.id },
    data: {
      manualGrade: grade ?? attempt.manualGrade,
      feedbackText: body.feedbackText ?? attempt.feedbackText,
      feedbackAudioKey: voiceUpload ? voiceUpload.key : attempt.feedbackAudioKey,
      status: "GRADED",
    },
  });

  // 🔔 notify the student that her exam was graded
  sendPushToUsers([attempt.userId], {
    title: "📝 تم تصحيح اختبارك",
    body: grade !== undefined ? `درجتك: ${grade}` : "اطلعي على ملاحظات المعلمة",
    url: "/dashboard",
    tag: `exam-${attempt.id}`,
  }).catch(() => {});

  return NextResponse.json({ ok: true, voiceUpload });
}
