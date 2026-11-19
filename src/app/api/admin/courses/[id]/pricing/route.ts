import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { findCountry } from "@/lib/phone";

/** Per-country monthly price overrides for a course (ADMIN or TEACHER). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await apiUser("TEACHER");
  if (error) return error;
  const { id } = await params;
  const prices = await db.coursePrice.findMany({ where: { courseId: id } });
  return NextResponse.json({ prices });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await apiUser("TEACHER");
  if (error) return error;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { countryCode?: string; price?: number };
  const cc = (body.countryCode || "").toUpperCase();
  if (!findCountry(cc)) return NextResponse.json({ error: "دولة غير معروفة" }, { status: 400 });
  if (body.price === undefined || body.price < 0) {
    return NextResponse.json({ error: "سعر غير صالح" }, { status: 400 });
  }
  const course = await db.course.findUnique({ where: { id } });
  if (!course) return NextResponse.json({ error: "الدورة غير موجودة" }, { status: 404 });

  const price = await db.coursePrice.upsert({
    where: { courseId_countryCode: { courseId: id, countryCode: cc } },
    update: { price: Math.round(body.price) },
    create: { courseId: id, countryCode: cc, price: Math.round(body.price) },
  });
  return NextResponse.json({ price });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await apiUser("TEACHER");
  if (error) return error;
  const { id } = await params;
  const cc = (new URL(req.url).searchParams.get("countryCode") || "").toUpperCase();
  await db.coursePrice.deleteMany({ where: { courseId: id, countryCode: cc } });
  return NextResponse.json({ ok: true });
}
