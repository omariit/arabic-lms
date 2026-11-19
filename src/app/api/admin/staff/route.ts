import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { normalizePhone } from "@/lib/phone";

/** Staff (TEACHER+): list the teaching assistants. */
export async function GET() {
  const { error } = await apiUser("TEACHER");
  if (error) return error;
  const assistants = await db.user.findMany({
    where: { role: "ASSISTANT" },
    select: { id: true, fullName: true, phone: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ assistants });
}

/** Staff (TEACHER+): create an assistant. Password is generated and shown once. */
export async function POST(req: Request) {
  const { error } = await apiUser("TEACHER");
  if (error) return error;
  const body = (await req.json().catch(() => ({}))) as { fullName?: string; phone?: string; countryCode?: string };
  const fullName = (body.fullName ?? "").trim();
  const normalized = normalizePhone(body.phone ?? "", body.countryCode ?? "JO");
  if (!fullName || !normalized.ok || !normalized.e164) {
    return NextResponse.json({ error: fullName ? "رقم الهاتف غير صالح" : "الاسم مطلوب" }, { status: 400 });
  }
  const exists = await db.user.findUnique({ where: { phone: normalized.e164 } });
  if (exists) return NextResponse.json({ error: "هذا الرقم مستخدم بالفعل" }, { status: 409 });

  // readable generated password (3 words from a short safe alphabet)
  const words = ["مصحف", "نور", "هدي", "إتقان", "سند", "بيان", "لقيا", "عطاء", "ربيع", "مها"];
  const password = `${words[Math.floor(Math.random() * words.length)]}-${Math.floor(1000 + Math.random() * 9000)}`;
  const user = await db.user.create({
    data: {
      fullName,
      phone: normalized.e164,
      countryCode: (body.countryCode ?? "JO").toUpperCase().slice(0, 2),
      passwordHash: await bcrypt.hash(password, 12),
      role: "ASSISTANT",
    },
  });
  return NextResponse.json({ assistant: { id: user.id, fullName: user.fullName, phone: user.phone }, password });
}

/** Staff (TEACHER+): remove an assistant (ASSISTANT accounts only). */
export async function DELETE(req: Request) {
  const { error } = await apiUser("TEACHER");
  if (error) return error;
  const body = (await req.json().catch(() => ({}))) as { id?: string };
  if (!body.id) return NextResponse.json({ error: "معرّف مفقود" }, { status: 400 });
  const user = await db.user.findUnique({ where: { id: body.id } });
  if (!user || user.role !== "ASSISTANT") return NextResponse.json({ error: "غير موجودة" }, { status: 404 });
  await db.user.delete({ where: { id: body.id } });
  return NextResponse.json({ ok: true });
}
