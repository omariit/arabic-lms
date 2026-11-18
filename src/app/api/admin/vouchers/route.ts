import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { randomBytes } from "crypto";

/** Voucher generator: single-use access codes. */
export async function GET() {
  const { error } = await apiUser("TEACHER");
  if (error) return error;
  const vouchers = await db.voucher.findMany({
    include: { course: { select: { title: true } }, user: { select: { fullName: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ vouchers });
}

export async function POST(req: Request) {
  const { user, error } = await apiUser("TEACHER");
  if (error) return error;
  const body = (await req.json().catch(() => ({}))) as { courseId?: string; count?: number };
  if (!body.courseId) return NextResponse.json({ error: "courseId مطلوب" }, { status: 400 });
  const course = await db.course.findUnique({ where: { id: body.courseId } });
  if (!course) return NextResponse.json({ error: "الدورة غير موجودة" }, { status: 404 });

  const count = Math.min(50, Math.max(1, Number(body.count) || 1));
  const created = await Promise.all(
    Array.from({ length: count }, () =>
      db.voucher.create({
        data: { code: randomBytes(4).toString("hex").toUpperCase(), courseId: course.id, createdBy: user.id },
      })
    )
  );
  return NextResponse.json({ vouchers: created.map((v) => v.code) });
}
