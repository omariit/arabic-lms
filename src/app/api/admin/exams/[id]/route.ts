import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";

/** One exam with its questions (drives the auto-loading builder screen). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await apiUser("TEACHER");
  if (error) return error;
  const { id } = await params;
  const exam = await db.exam.findUnique({
    where: { id },
    include: {
      questions: { orderBy: { position: "asc" } },
      course: { select: { id: true, title: true } },
      _count: { select: { attempts: true } },
    },
  });
  if (!exam) return NextResponse.json({ error: "غير موجود" }, { status: 404 });
  return NextResponse.json({ exam });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await apiUser("TEACHER");
  if (error) return error;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  if (typeof body.title === "string") data.title = body.title;
  if (body.published !== undefined) data.published = Boolean(body.published);
  if (body.durationMin !== undefined) data.durationMin = Math.max(1, Number(body.durationMin) || 15);
  if (body.maxGrade !== undefined) data.maxGrade = Math.max(1, Number(body.maxGrade) || 100);
  if (body.shuffleQuestions !== undefined) data.shuffleQuestions = Boolean(body.shuffleQuestions);
  if (body.shuffleOptions !== undefined) data.shuffleOptions = Boolean(body.shuffleOptions);
  const exam = await db.exam.update({ where: { id }, data });
  return NextResponse.json({ exam });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await apiUser("TEACHER");
  if (error) return error;
  const { id } = await params;
  await db.exam.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
