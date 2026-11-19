import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";

/** Admin course catalog CRUD. */
export async function GET() {
  const { error } = await apiUser("TEACHER");
  if (error) return error;
  const courses = await db.course.findMany({
    include: {
      prices: true,
      _count: { select: { modules: true, enrollments: true, exams: true } },
      modules: { orderBy: { position: "asc" }, include: { lessons: { orderBy: { position: "asc" } } } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ courses });
}

export async function POST(req: Request) {
  const { error } = await apiUser("TEACHER");
  if (error) return error;
  const body = (await req.json().catch(() => ({}))) as {
    title?: string; description?: string; price?: number; level?: string; coverColor?: string;
  };
  if (!body.title?.trim()) return NextResponse.json({ error: "العنوان مطلوب" }, { status: 400 });
  const course = await db.course.create({
    data: {
      title: body.title.trim(),
      description: body.description?.trim() || "",
      price: Math.max(0, Number(body.price) || 0),
      level: body.level?.trim() || "عام",
      coverColor: body.coverColor || "#1d5fe0",
    },
  });
  return NextResponse.json({ course });
}
