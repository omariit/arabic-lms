import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await apiUser("TEACHER");
  if (error) return error;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  if (typeof body.title === "string") data.title = body.title;
  if (typeof body.youtubeId === "string") data.youtubeId = body.youtubeId;
  if (body.access === "FREE_PREVIEW" || body.access === "ENROLLED") data.access = body.access;
  if (body.position !== undefined) data.position = Number(body.position);
  if (body.duration !== undefined) data.duration = Math.max(0, Number(body.duration) || 0);
  const lesson = await db.lesson.update({ where: { id }, data });
  return NextResponse.json({ lesson });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await apiUser("TEACHER");
  if (error) return error;
  const { id } = await params;
  await db.lesson.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
