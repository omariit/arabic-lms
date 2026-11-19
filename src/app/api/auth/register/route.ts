import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { normalizePhone, findCountry } from "@/lib/phone";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  const { ip } = await import("@/lib/auth").then((m) => m.clientMeta());
  const rl = rateLimit(`register:${ip}`, 5, 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  const body = (await req.json().catch(() => ({}))) as {
    fullName?: string; phone?: string; countryCode?: string; password?: string;
  };
  const fullName = body.fullName?.trim();
  const countryCode = (body.countryCode || "JO").toUpperCase();
  if (!fullName || fullName.length < 3)
    return NextResponse.json({ error: "الاسم الكامل مطلوب" }, { status: 400 });
  if (!findCountry(countryCode))
    return NextResponse.json({ error: "الدولة غير معروفة" }, { status: 400 });

  // Normalize: "0787262186" + JO → +962787262186 ; "00962787262186" → +962787262186
  const phone = normalizePhone(body.phone ?? "", countryCode);
  if (!phone.ok) {
    const msgs = {
      empty: "رقم الهاتف مطلوب",
      bad_chars: "رقم الهاتف يحتوي رموزًا غير صالحة",
      bad_length: "رقم الهاتف غير صالح للدولة المختارة",
      unknown_dial: "مفتاح الدولة في الرقم غير معروف — اختاري الدولة من القائمة",
    } as const;
    return NextResponse.json({ error: msgs[phone.error] }, { status: 400 });
  }

  const password = body.password ?? "";
  if (password.length < 6)
    return NextResponse.json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }, { status: 400 });

  const exists = await db.user.findUnique({ where: { phone: phone.e164 } });
  if (exists) return NextResponse.json({ error: "رقم الهاتف مسجل مسبقًا" }, { status: 409 });

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await db.user.create({
    data: { fullName, phone: phone.e164, countryCode, passwordHash, role: "STUDENT" },
  });
  await createSession(user.id);
  return NextResponse.json({ ok: true, redirect: "/dashboard" });
}
