import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

/** Student: redeem a single-use voucher code for course access. */
export async function POST(req: Request) {
  const { user, error } = await apiUser("STUDENT");
  if (error) return error;

  const rl = rateLimit(`voucher:${user.id}`, 10, 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  const { code } = (await req.json().catch(() => ({}))) as { code?: string };
  const clean = code?.trim().toUpperCase();
  if (!clean) return NextResponse.json({ error: "أدخل رمز الكوبون" }, { status: 400 });

  const voucher = await db.voucher.findUnique({ where: { code: clean }, include: { course: true } });
  if (!voucher) return NextResponse.json({ error: "الكوبون غير موجود" }, { status: 404 });
  if (voucher.expired || voucher.usedById) {
    return NextResponse.json({ error: "الكوبون مستخدم مسبقًا" }, { status: 409 });
  }

  await db.$transaction([
    db.voucher.update({ where: { id: voucher.id }, data: { usedById: user.id, usedAt: new Date() } }),
    db.enrollment.upsert({
      where: { userId_courseId: { userId: user.id, courseId: voucher.courseId } },
      update: { status: "ACTIVE", grantedVia: "voucher" },
      create: { userId: user.id, courseId: voucher.courseId, grantedVia: "voucher" },
    }),
  ]);
  return NextResponse.json({ ok: true, courseTitle: voucher.course.title, courseId: voucher.courseId });
}
