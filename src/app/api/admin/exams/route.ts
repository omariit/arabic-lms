import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";

export async function GET() {
  const { error } = await apiUser("TEACHER");
  if (error) return error;
  const exams = await db.exam.findMany({
    include: {
      course: { select: { title: true } },
      _count: { select: { questions: true, attempts: true } },
      questions: { orderBy: { position: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ exams });
}

export async function POST(req: Request) {
  const { error } = await apiUser("TEACHER");
  if (error) return error;
  const body = (await req.json().catch(() => ({}))) as {
    courseId?: string; title?: string; type?: string; durationMin?: number; maxGrade?: number;
  };
  if (!body.courseId || !body.title?.trim()) return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });
  const exam = await db.exam.create({
    data: {
      courseId: body.courseId,
      title: body.title.trim(),
      type: body.type === "VOICE" ? "VOICE" : "MCQ",
      durationMin: Math.max(1, Number(body.durationMin) || 15),
      maxGrade: Math.max(1, Number(body.maxGrade) || 100),
    },
  });
  return NextResponse.json({ exam });
}
