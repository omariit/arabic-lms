import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";

export async function POST(req: Request) {
  const { error } = await apiUser("TEACHER");
  if (error) return error;
  const body = (await req.json().catch(() => ({}))) as {
    moduleId?: string; title?: string; youtubeId?: string; access?: string; duration?: number;
    description?: string; scriptText?: string; assignmentTitle?: string; assignmentInstructions?: string;
  };
  if (!body.moduleId || !body.title?.trim() || !body.youtubeId?.trim()) {
    return NextResponse.json({ error: "بيانات ناقصة (العنوان ومعرّف يوتيوب مطلوبان)" }, { status: 400 });
  }
  const count = await db.lesson.count({ where: { moduleId: body.moduleId } });
  const lesson = await db.lesson.create({
    data: {
      moduleId: body.moduleId,
      title: body.title.trim(),
      youtubeId: body.youtubeId.trim(),
      access: body.access === "FREE_PREVIEW" ? "FREE_PREVIEW" : "ENROLLED",
      duration: Math.max(0, Number(body.duration) || 0),
      position: count,
      description: (body.description ?? "").slice(0, 5000),
      scriptText: (body.scriptText ?? "").slice(0, 20000),
      assignmentTitle: body.assignmentTitle?.trim() || null,
      assignmentInstructions: (body.assignmentInstructions ?? "").slice(0, 5000),
    },
  });
  return NextResponse.json({ lesson });
}
