import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await apiUser("ADMIN");
  if (error) return error;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  if (typeof body.title === "string") data.title = body.title;
  if (body.published !== undefined) data.published = Boolean(body.published);
  if (body.durationMin !== undefined) data.durationMin = Math.max(1, Number(body.durationMin) || 15);
  if (body.maxGrade !== undefined) data.maxGrade = Math.max(1, Number(body.maxGrade) || 100);
  const exam = await db.exam.update({ where: { id }, data });
  return NextResponse.json({ exam });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await apiUser("ADMIN");
  if (error) return error;
  const { id } = await params;
  await db.exam.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
