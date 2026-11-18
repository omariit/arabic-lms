import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await apiUser("ADMIN");
  if (error) return error;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { title?: string; position?: number };
  const module = await db.module.update({
    where: { id },
    data: { ...(body.title ? { title: body.title } : {}), ...(body.position !== undefined ? { position: body.position } : {}) },
  });
  return NextResponse.json({ module });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await apiUser("ADMIN");
  if (error) return error;
  const { id } = await params;
  await db.module.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
