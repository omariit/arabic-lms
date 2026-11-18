import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";

/** Device lock reset: kill all active sessions so the student can sign in on a new device. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await apiUser("ADMIN");
  if (error) return error;
  const { id } = await params;
  const result = await db.session.updateMany({ where: { userId: id, active: true }, data: { active: false } });
  return NextResponse.json({ ok: true, killedSessions: result.count });
}
