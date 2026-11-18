import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";

/**
 * Enrollment management:
 * GET — pending requests + all enrollments
 * PATCH — { requestId, action: "APPROVE" | "REJECT" } one-tap approval
 * POST — manual grant { userId, courseId }
 */
export async function GET() {
  const { error } = await apiUser("ADMIN");
  if (error) return error;
  const [requests, enrollments] = await Promise.all([
    db.enrollmentRequest.findMany({
      include: { user: { select: { fullName: true, phone: true } }, course: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.enrollment.findMany({
      include: { user: { select: { fullName: true, phone: true } }, course: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);
  return NextResponse.json({ requests, enrollments });
}

export async function PATCH(req: Request) {
  const { error } = await apiUser("ADMIN");
  if (error) return error;
  const { requestId, action } = (await req.json().catch(() => ({}))) as { requestId?: string; action?: string };
  if (!requestId || !action) return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });

  const request = await db.enrollmentRequest.findUnique({ where: { id: requestId } });
  if (!request) return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });

  if (action === "APPROVE") {
    await db.$transaction([
      db.enrollment.upsert({
        where: { userId_courseId: { userId: request.userId, courseId: request.courseId } },
        update: { status: "ACTIVE", grantedVia: "request" },
        create: { userId: request.userId, courseId: request.courseId, grantedVia: "request" },
      }),
      db.enrollmentRequest.update({
        where: { id: request.id },
        data: { status: "APPROVED", decidedAt: new Date() },
      }),
    ]);
  } else if (action === "REJECT") {
    await db.enrollmentRequest.update({
      where: { id: request.id },
      data: { status: "REJECTED", decidedAt: new Date() },
    });
  } else {
    return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const { error } = await apiUser("ADMIN");
  if (error) return error;
  const { userId, courseId } = (await req.json().catch(() => ({}))) as { userId?: string; courseId?: string };
  if (!userId || !courseId) return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });
  const enrollment = await db.enrollment.upsert({
    where: { userId_courseId: { userId, courseId } },
    update: { status: "ACTIVE", grantedVia: "manual" },
    create: { userId, courseId, grantedVia: "manual" },
  });
  return NextResponse.json({ enrollment });
}
