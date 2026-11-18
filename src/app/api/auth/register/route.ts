import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientMeta, createSession } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  const { ip } = await clientMeta();
  const rl = rateLimit(`register:${ip}`, 5, 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  const body = (await req.json().catch(() => ({}))) as { fullName?: string; phone?: string; password?: string };
  const fullName = body.fullName?.trim();
  const phone = body.phone?.trim();
  const password = body.password ?? "";

  if (!fullName || fullName.length < 3)
    return NextResponse.json({ error: "الاسم الكامل مطلوب" }, { status: 400 });
  if (!phone || !/^0?\d{8,15}$/.test(phone))
    return NextResponse.json({ error: "رقم الهاتف غير صالح" }, { status: 400 });
  if (password.length < 6)
    return NextResponse.json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }, { status: 400 });

  const exists = await db.user.findUnique({ where: { phone } });
  if (exists) return NextResponse.json({ error: "رقم الهاتف مسجل مسبقًا" }, { status: 409 });

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await db.user.create({
    data: { fullName, phone, passwordHash, role: "STUDENT" },
  });
  await createSession(user.id);
  return NextResponse.json({ ok: true, redirect: "/dashboard" });
}
