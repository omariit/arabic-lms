import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await apiUser("TEACHER");
  if (error) return error;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  for (const k of ["title", "description", "level", "coverColor"]) {
    if (typeof body[k] === "string") data[k] = body[k];
  }
  if (body.price !== undefined) data.price = Math.max(0, Number(body.price) || 0);
  if (body.published !== undefined) data.published = Boolean(body.published);
  const course = await db.course.update({ where: { id }, data });
  return NextResponse.json({ course });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await apiUser("TEACHER");
  if (error) return error;
  const { id } = await params;
  await db.course.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
