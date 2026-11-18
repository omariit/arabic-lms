import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";

export async function POST(req: Request) {
  const { error } = await apiUser("ADMIN");
  if (error) return error;
  const body = (await req.json().catch(() => ({}))) as { courseId?: string; title?: string; position?: number };
  if (!body.courseId || !body.title?.trim()) return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });
  const count = await db.module.count({ where: { courseId: body.courseId } });
  const module = await db.module.create({
    data: { courseId: body.courseId, title: body.title.trim(), position: body.position ?? count },
  });
  return NextResponse.json({ module });
}
