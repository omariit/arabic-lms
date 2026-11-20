import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { verifyUpload } from "@/lib/r2";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await apiUser("TEACHER");
  if (error) return error;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  if (typeof body.title === "string") data.title = body.title;
  if (typeof body.youtubeId === "string") data.youtubeId = body.youtubeId;
  if (body.access === "FREE_PREVIEW" || body.access === "ENROLLED") data.access = body.access;
  if (body.position !== undefined) data.position = Number(body.position);
  if (body.duration !== undefined) data.duration = Math.max(0, Number(body.duration) || 0);
  if (typeof body.description === "string") data.description = body.description.slice(0, 5000);
  if (typeof body.scriptText === "string") data.scriptText = body.scriptText.slice(0, 20000);
  if (typeof body.assignmentTitle === "string") data.assignmentTitle = body.assignmentTitle.trim() || null;
  if (typeof body.assignmentInstructions === "string") data.assignmentInstructions = body.assignmentInstructions.slice(0, 5000);

  // Optional teacher recording of the lesson — uploaded browser → R2, key validated by HEAD.
  if (typeof body.audioKey === "string" && body.audioKey) {
    const check = await verifyUpload(body.audioKey, "lesson", user.id);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
    data.audioKey = body.audioKey;
  }
  if (body.clearAudio === true) data.audioKey = null;
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
