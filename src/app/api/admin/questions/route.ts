import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";

export async function POST(req: Request) {
  const { error } = await apiUser("TEACHER");
  if (error) return error;
  const body = (await req.json().catch(() => ({}))) as {
    examId?: string; text?: string; type?: string; options?: string[]; correctIndex?: number;
  };
  if (!body.examId || !body.text?.trim()) return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });
  const exam = await db.exam.findUnique({ where: { id: body.examId } });
  if (!exam) return NextResponse.json({ error: "الاختبار غير موجود" }, { status: 404 });

  const type = body.type === "TRUE_FALSE" ? "TRUE_FALSE" : "MCQ";
  const options = type === "TRUE_FALSE" ? ["صح", "خطأ"] : (body.options ?? []).map(String).filter(Boolean);
  const correctIndex = Math.max(0, Math.min(options.length - 1, Number(body.correctIndex ?? 0)));

  const count = await db.question.count({ where: { examId: exam.id } });
  const question = await db.question.create({
    data: { examId: exam.id, text: body.text.trim(), type, options, correctIndex, position: count },
  });
  return NextResponse.json({ question });
}
