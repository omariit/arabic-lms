import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientMeta } from "@/lib/auth";
import { rateLimit, rateLimitPeek, rateLimitReset, rateLimitResponse } from "@/lib/rate-limit";
import { loginVariants } from "@/lib/phone";
import { normalizePhoneInput, passwordCandidates } from "@/lib/login-input";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  const { ip } = await clientMeta();

  const body = (await req.json().catch(() => ({}))) as {
    phone?: string; password?: string; countryCode?: string;
  };
  if (!body.phone || !body.password) {
    return NextResponse.json({ error: "يرجى إدخال رقم الهاتف وكلمة المرور" }, { status: 400 });
  }

  // Rate limiting counts FAILURES, not attempts. Counting every attempt used to
  // lock out the teacher while she was simply testing her own password several
  // times in a row (8 tries per minute and the account looked "broken").
  // Arabic-Indic digits / stray dashes are typing artifacts: normalise before
  // we key the bucket, otherwise "٠٧٨…" would bypass it.
  const cleanPhone = normalizePhoneInput(body.phone);
  const phoneKey = cleanPhone.replace(/[^0-9]/g, "").slice(-9);
  const failKey = `login-fail:${ip}:${phoneKey}`;
  const FAIL_LIMIT = 8;
  const FAIL_WINDOW = 60_000;

  const failState = rateLimitPeek(failKey, FAIL_LIMIT, FAIL_WINDOW);
  if (failState.remaining === 0) {
    return rateLimitResponse(
      failState.retryAfter,
      `توقّف مؤقت لحماية الحساب بعد ${FAIL_LIMIT} محاولات خاطئة — حاولي بعد ${failState.retryAfter} ثانية`,
    );
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
  // Try the typed password, then the same value with keyboard artifacts fixed
  // (smart dashes, NBSP, Arabic-Indic digits) — those are never real differences.
  let passwordOk = false;
  if (user) {
    for (const candidate of passwordCandidates(body.password)) {
      if (await bcrypt.compare(candidate, user.passwordHash)) {
        passwordOk = true;
        break;
      }
    }
  }

  if (!user || !passwordOk) {
    // Guard against credential stuffing from one address across many numbers.
    const perIpFail = rateLimit(`login-ip-fail:${ip}`, 60, 60_000);
    if (!perIpFail.ok) {
      await db.securityViolation
        .create({ data: { type: "RATE_LIMIT_ABUSE", detail: "login failures from one IP", ipAddress: ip } })
        .catch(() => {});
      return rateLimitResponse(perIpFail.retryAfter);
    }
    const fail = rateLimit(failKey, FAIL_LIMIT, FAIL_WINDOW);
    // A failed login is worth a server-side breadcrumb: without it we cannot tell
    // "wrong number" from "wrong password" when a user reports "it does not work".
    console.log(
      `[login] failure phone=${phoneKey} found=${Boolean(user)} passwordMatch=${passwordOk} attemptsLeft=${fail.ok ? Math.max(0, rateLimitPeek(failKey, FAIL_LIMIT, FAIL_WINDOW).remaining) : 0}`,
    );
    const attemptsLeft = rateLimitPeek(failKey, FAIL_LIMIT, FAIL_WINDOW).remaining;
    const error = !user
      ? "لا يوجد حساب بهذا الرقم — تأكّدي من الرقم أو اختاري مفتاح الدولة الصحيح"
      : `كلمة المرور غير صحيحة — تبقّى ${attemptsLeft} محاولة قبل توقف مؤقت`;
    return NextResponse.json({ error, attemptsLeft, status401: true }, { status: 401 });
  }

  // Success clears the failure history so she can keep signing in from any device.
  rateLimitReset(failKey);

  // Single-device enforcement is applied inside createSession.
  const { createSession } = await import("@/lib/auth");
  await createSession(user.id);

  return NextResponse.json({
    ok: true,
    role: user.role,
    redirect: user.role === "STUDENT" ? "/dashboard" : "/admin",
  });
}
