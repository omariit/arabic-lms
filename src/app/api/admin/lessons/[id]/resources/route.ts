import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { verifyUpload, headObject } from "@/lib/r2";

/** Teacher: list the downloadable material attached to a lesson. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await apiUser("TEACHER");
  if (error) return error;
  const { id } = await params;
  const resources = await db.lessonResource.findMany({
    where: { lessonId: id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ resources });
}

/**
 * Teacher: attach a file the browser already uploaded to R2.
 * Only the key is posted; ownership + size + MIME are verified by HEAD.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await apiUser("TEACHER");
  if (error) return error;
  const { id } = await params;

  const body = (await req.json().catch(() => ({}))) as { title?: string; fileKey?: string; mimeType?: string };
  if (!body.fileKey) return NextResponse.json({ error: "لا يوجد ملف" }, { status: 400 });

  const lesson = await db.lesson.findUnique({ where: { id }, select: { title: true } });
  if (!lesson) return NextResponse.json({ error: "الدرس غير موجود" }, { status: 404 });

  const check = await verifyUpload(body.fileKey, "resource", user.id);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  const meta = await headObject(body.fileKey);
  const resource = await db.lessonResource.create({
    data: {
      lessonId: id,
      title: (body.title ?? "").trim().slice(0, 160) || "ملف الدرس",
      fileKey: body.fileKey,
      mimeType: body.mimeType || meta?.contentType || "application/octet-stream",
      size: meta?.size ?? 0,
    },
  });
  return NextResponse.json({ resource });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await apiUser("TEACHER");
  if (error) return error;
  const { id } = await params;
  const url = new URL(req.url);
  const resourceId = url.searchParams.get("resourceId");
  if (!resourceId) return NextResponse.json({ error: "resourceId مطلوب" }, { status: 400 });
  await db.lessonResource.deleteMany({ where: { id: resourceId, lessonId: id } });
  return NextResponse.json({ ok: true });
}
