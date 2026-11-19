import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientMeta } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { loginVariants } from "@/lib/phone";
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

  const body = (await req.json().catch(() => ({}))) as {
    phone?: string; password?: string; countryCode?: string;
  };
  if (!body.phone || !body.password) {
    return NextResponse.json({ error: "يرجى إدخال رقم الهاتف وكلمة المرور" }, { status: 400 });
  }

  // The stored phone is normalized E.164; the user may type any familiar form
  // (0787262186, 787262186, 00962787262186, +962787262186).
  const variants = loginVariants(body.phone, body.countryCode || "JO");
  let user = null;
  for (const candidate of variants) {
    const found = await db.user.findFirst({
      where: { phone: { in: [candidate, candidate.replace(/^\+/, ""), `+${candidate.replace(/^\+/, "")}`] } },
    });
    if (found) { user = found; break; }
  }
  if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
    return NextResponse.json({ error: "رقم الهاتف أو كلمة المرور غير صحيحة" }, { status: 401 });
  }

  // Single-device enforcement is applied inside createSession.
  const { createSession } = await import("@/lib/auth");
  await createSession(user.id);

  return NextResponse.json({
    ok: true,
    role: user.role,
    redirect: user.role === "STUDENT" ? "/dashboard" : "/admin",
  });
}
