import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { r2Configured, presignGet } from "@/lib/r2";

/** Presigned GET for the teacher's own recording attached to a lesson (enrolled students + staff). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await apiUser("any");
  if (error) return error;
  const { id } = await params;

  const lesson = await db.lesson.findUnique({
    where: { id },
    select: { audioKey: true, access: true, module: { select: { courseId: true } } },
  });
  if (!lesson?.audioKey) return NextResponse.json({ error: "لا يوجد تسجيل لهذا الدرس" }, { status: 404 });

  if (user.role === "STUDENT") {
    const enrolled = await db.enrollment.findFirst({
      where: { userId: user.id, courseId: lesson.module.courseId, status: "ACTIVE" },
    });
    if (!enrolled && lesson.access !== "FREE_PREVIEW") {
      return NextResponse.json({ error: "يجب التسجيل في الدورة" }, { status: 403 });
    }
  }
  if (!r2Configured()) return NextResponse.json({ error: "التخزين غير مهيأ" }, { status: 503 });

  const url = await presignGet(lesson.audioKey, 600);
  return NextResponse.json({ url, expiresIn: 600 });
}
