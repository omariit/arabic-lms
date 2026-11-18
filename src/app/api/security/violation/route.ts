import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser, clientMeta } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import type { ViolationType } from "@prisma/client";

const ALLOWED: ViolationType[] = ["WATERMARK_TAMPER", "TAB_SWITCH_DURING_EXAM", "RATE_LIMIT_ABUSE", "OTHER"];

/** Client-reported security violations (watermark tamper, exam tab switches). */
export async function POST(req: Request) {
  const { user, error } = await apiUser("any");
  if (error) return error;
  const { ip } = await clientMeta();

  const rl = rateLimit(`violation:${user.id}`, 60, 60_000);
  if (!rl.ok) return rateLimitResponse(rl.retryAfter);

  const body = (await req.json().catch(() => ({}))) as { type?: string; detail?: string };
  if (!body.type || !ALLOWED.includes(body.type as ViolationType)) {
    return NextResponse.json({ error: "نوع مخالفة غير معروف" }, { status: 400 });
  }
  await db.securityViolation.create({
    data: {
      userId: user.id,
      type: body.type as ViolationType,
      detail: String(body.detail ?? "").slice(0, 2000),
      ipAddress: ip,
    },
  });
  return NextResponse.json({ ok: true });
}
