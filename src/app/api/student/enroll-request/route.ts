import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

/** Student: submit an enrollment request with a CliQ/bank transfer receipt reference. */
export async function POST(req: Request) {
  const { user, error } = await apiUser("STUDENT");
  if (error) return error;

  const rl = rateLimit(`enrollreq:${user.id}`, 5, 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  const body = (await req.json().catch(() => ({}))) as { courseId?: string; receiptRef?: string; note?: string };
  if (!body.courseId || !body.receiptRef?.trim()) {
    return NextResponse.json({ error: "مرجع الإيصال مطلوب" }, { status: 400 });
  }
  const course = await db.course.findUnique({ where: { id: body.courseId } });
  if (!course) return NextResponse.json({ error: "الدورة غير موجودة" }, { status: 404 });

  const existing = await db.enrollmentRequest.findFirst({
    where: { userId: user.id, courseId: course.id, status: "PENDING" },
  });
  if (existing) return NextResponse.json({ error: "لديك طلب قيد المراجعة بالفعل" }, { status: 409 });

  const request = await db.enrollmentRequest.create({
    data: {
      userId: user.id,
      courseId: course.id,
      receiptRef: body.receiptRef.trim(),
      note: body.note?.trim() || null,
    },
  });
  return NextResponse.json({ ok: true, requestId: request.id });
}
