import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await apiUser("TEACHER");
  if (error) return error;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  for (const k of ["name", "text", "level"]) {
    if (typeof body[k] === "string") data[k] = (body[k] as string).trim();
  }
  if (body.rating !== undefined) data.rating = Math.min(5, Math.max(1, Number(body.rating) || 5));
  if (body.published !== undefined) data.published = Boolean(body.published);
  const testimonial = await db.testimonial.update({ where: { id }, data });
  return NextResponse.json({ testimonial });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await apiUser("TEACHER");
  if (error) return error;
  const { id } = await params;
  await db.testimonial.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
