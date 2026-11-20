import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { verifyUpload, presignGet } from "@/lib/r2";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await apiUser("TEACHER");
  if (error) return error;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  for (const k of ["title", "description", "level", "coverColor", "weeklyMeetings", "outcomes", "requirements"]) {
    if (typeof body[k] === "string") data[k] = (body[k] as string).slice(0, 5000);
  }
  // Cover artwork is uploaded browser → R2; validate the returned key with a HEAD.
  if (typeof body.coverImageKey === "string" && body.coverImageKey) {
    const check = await verifyUpload(body.coverImageKey, "cover", user.id);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
    data.coverImageKey = body.coverImageKey;
  }
  if (body.clearCover === true) data.coverImageKey = null;
  if (body.price !== undefined) data.price = Math.max(0, Number(body.price) || 0);
  if (body.published !== undefined) data.published = Boolean(body.published);
  const course = await db.course.update({ where: { id }, data });
  return NextResponse.json({ course });
}

/** Short-lived preview URL for the uploaded cover (private bucket). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await apiUser("TEACHER");
  if (error) return error;
  const { id } = await params;
  const course = await db.course.findUnique({ where: { id }, select: { coverImageKey: true } });
  if (!course?.coverImageKey) return NextResponse.json({ coverUrl: null });
  return NextResponse.json({ coverUrl: await presignGet(course.coverImageKey, 900) });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await apiUser("TEACHER");
  if (error) return error;
  const { id } = await params;
  await db.course.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
