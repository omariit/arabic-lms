import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await apiUser("ADMIN");
  if (error) return error;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    text?: string; options?: string[]; correctIndex?: number; position?: number;
  };
  const data: Record<string, unknown> = {};
  if (typeof body.text === "string") data.text = body.text;
  if (Array.isArray(body.options)) data.options = body.options.map(String);
  if (body.correctIndex !== undefined) data.correctIndex = Number(body.correctIndex);
  if (body.position !== undefined) data.position = Number(body.position);
  const question = await db.question.update({ where: { id }, data });
  return NextResponse.json({ question });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await apiUser("ADMIN");
  if (error) return error;
  const { id } = await params;
  await db.question.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
