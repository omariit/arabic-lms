import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientMeta } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { loginVariants } from "@/lib/phone";
import { normalizePhoneInput, passwordCandidates } from "@/lib/login-input";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  const { ip, userAgent } = await clientMeta();

  const body = (await req.json().catch(() => ({}))) as {
    phone?: string; password?: string; countryCode?: string;
  };
  if (!body.phone || !body.password) {
    return NextResponse.json({ error: "يرجى إدخال رقم الهاتف وكلمة المرور" }, { status: 400 });
  }

  // Two buckets: per (IP + the number being tried) to stop brute-forcing one
  // account, and a much looser per-IP ceiling. Keying only by IP used to lock out
  // everyone behind the same network (a school, a family, a whole QA run).
  // Arabic-Indic digits / stray dashes are typing artifacts: normalise before
  // we rate-limit on the number, otherwise "٠٧٨…" would bypass the bucket.
  const cleanPhone = normalizePhoneInput(body.phone);
  const phoneKey = cleanPhone.replace(/[^0-9]/g, "").slice(-9);
  const perAccount = rateLimit(`login:${ip}:${phoneKey}`, 8, 60_000);
  if (!perAccount.ok) return rateLimitResponse(perAccount.retryAfter);

  const perIp = rateLimit(`login-ip:${ip}`, 60, 60_000);
  if (!perIp.ok) {
    await db.securityViolation.create({
      data: { type: "RATE_LIMIT_ABUSE", detail: "login brute force", ipAddress: ip },
    });
    return rateLimitResponse(perIp.retryAfter);
  }

  // The stored phone is normalized E.164; the user may type any familiar form
  // (0787262186, 787262186, 00962787262186, +962787262186).
  if (cleanPhone.replace(/\D/g, "").length < 6) {
    return NextResponse.json(
      { error: "رقم الهاتف غير واضح — استخدمي الأرقام الإنجليزية (0-9) مثل 0787262186" },
      { status: 400 },
    );
  }
  const variants = loginVariants(cleanPhone, body.countryCode || "JO");
  let user = null;
  for (const candidate of variants) {
    const found = await db.user.findFirst({
      where: { phone: { in: [candidate, candidate.replace(/^\+/, ""), `+${candidate.replace(/^\+/, "")}`] } },
    });
    if (found) { user = found; break; }
  }
  if (!user) {
    return NextResponse.json({ error: "رقم الهاتف أو كلمة المرور غير صحيحة" }, { status: 401 });
  }
  // Try the typed password, then the same value with keyboard artifacts fixed
  // (smart dashes, NBSP, Arabic-Indic digits) — those are never real differences.
  let passwordOk = false;
  for (const candidate of passwordCandidates(body.password)) {
    if (await bcrypt.compare(candidate, user.passwordHash)) {
      passwordOk = true;
      break;
    }
  }
  if (!passwordOk) {
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
