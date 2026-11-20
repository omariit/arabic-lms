import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { presignGet, r2Configured } from "@/lib/r2";

/** Student: open/download a lesson attachment the teacher uploaded (enrolment gated). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; resourceId: string }> }) {
  const { user, error } = await apiUser("any");
  if (error) return error;
  const { id, resourceId } = await params;

  const resource = await db.lessonResource.findUnique({
    where: { id: resourceId },
    include: { lesson: { select: { id: true, access: true, module: { select: { courseId: true } } } } },
  });
  if (!resource || resource.lessonId !== id) {
    return NextResponse.json({ error: "الملف غير موجود" }, { status: 404 });
  }

  if (user.role === "STUDENT") {
    const enrolled = await db.enrollment.findFirst({
      where: { userId: user.id, courseId: resource.lesson.module.courseId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!enrolled && resource.lesson.access !== "FREE_PREVIEW") {
      return NextResponse.json({ error: "يجب التسجيل في الدورة" }, { status: 403 });
    }
  }
  if (!r2Configured()) return NextResponse.json({ error: "التخزين غير مهيأ" }, { status: 503 });

  const url = await presignGet(resource.fileKey, 600);
  return NextResponse.json({ url, title: resource.title, mimeType: resource.mimeType, size: resource.size });
}
