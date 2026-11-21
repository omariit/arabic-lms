import { db } from "@/lib/db";
import { rateLimit, rateLimitPeek, rateLimitReset } from "@/lib/rate-limit";
import { loginVariants } from "@/lib/phone";
import { normalizePhoneInput, passwordCandidates } from "@/lib/login-input";
import bcrypt from "bcryptjs";

/**
 * Shared credential check for the two entrances to the same door:
 *   • POST /api/auth/login        (JSON, used by the hydrated app)
 *   • POST /api/auth/login-form   (plain HTML form, works with no JavaScript)
 *
 * Rate limiting counts FAILURES only, so a teacher testing her own password can
 * never lock herself out; a successful sign-in clears the counter.
 */
export type LoginResult =
  | { ok: true; user: { id: string; role: string; fullName: string } }
  | { ok: false; status: number; code: string; error: string; attemptsLeft?: number; retryAfter?: number };

const FAIL_LIMIT = 8;
const FAIL_WINDOW = 60_000;

export async function attemptLogin(input: {
  phone?: string;
  password?: string;
  countryCode?: string;
  ip: string;
}): Promise<LoginResult> {
  const phone = (input.phone ?? "").trim();
  const password = input.password ?? "";
  if (!phone || !password) {
    return { ok: false, status: 400, code: "missing", error: "يرجى إدخال رقم الهاتف وكلمة المرور" };
  }

  const cleanPhone = normalizePhoneInput(phone);
  if (cleanPhone.replace(/\D/g, "").length < 6) {
    return {
      ok: false,
      status: 400,
      code: "bad-phone",
      error: "رقم الهاتف غير واضح — استخدمي الأرقام الإنجليزية (0-9) مثل 0787262186",
    };
  }

  const phoneKey = cleanPhone.replace(/[^0-9]/g, "").slice(-9);
  const failKey = `login-fail:${input.ip}:${phoneKey}`;
  const failState = rateLimitPeek(failKey, FAIL_LIMIT, FAIL_WINDOW);
  if (failState.remaining === 0) {
    return {
      ok: false,
      status: 429,
      code: "rate",
      error: `توقّف مؤقت لحماية الحساب بعد ${FAIL_LIMIT} محاولات خاطئة — حاولي بعد ${failState.retryAfter} ثانية`,
      retryAfter: failState.retryAfter,
    };
  }

  // The stored phone is E.164; the user may type any familiar form
  // (0787262186, 787262186, 962787262186, 00962787262186, +962787262186).
  const variants = loginVariants(cleanPhone, input.countryCode || "JO");
  let user = null;
  for (const candidate of variants) {
    const found = await db.user.findFirst({
      where: { phone: { in: [candidate, candidate.replace(/^\+/, ""), `+${candidate.replace(/^\+/, "")}`] } },
      select: { id: true, role: true, fullName: true, passwordHash: true },
    });
    if (found) {
      user = found;
      break;
    }
  }

  let passwordOk = false;
  if (user) {
    for (const candidate of passwordCandidates(password)) {
      if (await bcrypt.compare(candidate, user.passwordHash)) {
        passwordOk = true;
        break;
      }
    }
  }

  if (!user || !passwordOk) {
    // Guard against credential stuffing from one address across many numbers.
    const perIpFail = rateLimit(`login-ip-fail:${input.ip}`, 60, FAIL_WINDOW);
    if (!perIpFail.ok) {
      await db.securityViolation
        .create({ data: { type: "RATE_LIMIT_ABUSE", detail: "login failures from one IP", ipAddress: input.ip } })
        .catch(() => {});
      return {
        ok: false,
        status: 429,
        code: "rate-ip",
        error: `محاولات كثيرة من هذا الاتصال — حاولي بعد ${perIpFail.retryAfter} ثانية`,
        retryAfter: perIpFail.retryAfter,
      };
    }

    rateLimit(failKey, FAIL_LIMIT, FAIL_WINDOW);
    const { remaining } = rateLimitPeek(failKey, FAIL_LIMIT, FAIL_WINDOW);
    // Breadcrumb: without it we cannot tell "wrong number" from "wrong password"
    // when a user reports "it does not work". Never logs the password itself.
    console.log(
      `[login] failure phone=${phoneKey} found=${Boolean(user)} passwordMatch=${passwordOk} attemptsLeft=${remaining}`,
    );
    return {
      ok: false,
      status: 401,
      code: user ? "bad-password" : "no-account",
      error: user
        ? `كلمة المرور غير صحيحة — تبقّى ${remaining} محاولة قبل توقف مؤقت`
        : "لا يوجد حساب بهذا الرقم — تأكّدي من الرقم أو اختاري مفتاح الدولة الصحيح",
      attemptsLeft: remaining,
    };
  }

  rateLimitReset(failKey);
  return { ok: true, user: { id: user.id, role: user.role, fullName: user.fullName } };
}

export function homeFor(role: string) {
  return role === "STUDENT" ? "/dashboard" : "/admin";
}
