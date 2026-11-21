import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";

/**
 * Staff sets a new password for a student (the usual case: the student forgot it,
 * or the teacher created the account and needs to hand over credentials).
 *
 * Every existing session of that student is invalidated, so a forgotten password
 * shared with the wrong person stops working immediately.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, error } = await apiUser("STAFF");
  if (error || !user) return error!;

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { password?: string };
  const password = (body.password ?? "").trim();

  if (password.length < 8) {
    return NextResponse.json({ error: "كلمة المرور يجب أن تكون 8 أحرف على الأقل" }, { status: 400 });
  }
  if (password.length > 72) {
    return NextResponse.json({ error: "كلمة المرور طويلة جدًا (72 حرفًا كحد أقصى)" }, { status: 400 });
  }

  const target = await db.user.findUnique({ where: { id }, select: { id: true, role: true, fullName: true } });
  if (!target) return NextResponse.json({ error: "الحساب غير موجود" }, { status: 404 });
  if (target.role === "STUDENT" || user.role === "ADMIN") {
    // A teacher may only set passwords for students; admin may set any.
  } else {
    return NextResponse.json({ error: "يمكنك تعيين كلمة مرور للطالبات فقط" }, { status: 403 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db.user.update({ where: { id }, data: { passwordHash } });
  const killed = await db.session.updateMany({ where: { userId: id, active: true }, data: { active: false } });

  return NextResponse.json({ ok: true, name: target.fullName, killedSessions: killed.count });
}
