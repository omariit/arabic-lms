import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientMeta } from "@/lib/auth";
import { fingerprintFrom } from "@/lib/crypto";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  const { ip, userAgent } = await clientMeta();
  const rl = rateLimit(`login:${ip}`, 8, 60_000);
  if (!rl.ok) {
    await db.securityViolation.create({
      data: { type: "RATE_LIMIT_ABUSE", detail: "login brute force", ipAddress: ip },
    });
    return rateLimitResponse(rl.retryAfter);
  }

  const { phone, password } = await req.json().catch(() => ({}) as never) as { phone?: string; password?: string };
  if (!phone || !password) {
    return NextResponse.json({ error: "يرجى إدخال رقم الهاتف وكلمة المرور" }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { phone } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return NextResponse.json({ error: "رقم الهاتف أو كلمة المرور غير صحيحة" }, { status: 401 });
  }

  // Single-device enforcement is applied inside createSession.
  const { createSession } = await import("@/lib/auth");
  await createSession(user.id);

  return NextResponse.json({
    ok: true,
    role: user.role,
    redirect: user.role === "ADMIN" ? "/admin" : "/dashboard",
  });
}
