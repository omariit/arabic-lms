import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { purgeOrphanRecordings, recordingConfigured } from "@/lib/recording";

/**
 * Admin maintenance: delete recording folders the database no longer references.
 *
 * Volume storage is billed, and a wiped volume plus a wiped table leave byte-sized
 * garbage that nobody can see in the UI. Returns how much was freed so the operator
 * can confirm it instead of trusting a log line.
 */
export async function POST() {
  const { user, error } = await apiUser("ADMIN");
  if (error || !user) return error!;
  if (!recordingConfigured()) {
    return NextResponse.json({ error: "خدمة التسجيل غير مفعّلة" }, { status: 503 });
  }

  const rows = await db.recordingSession.findMany({ select: { serviceId: true } });
  const keep = rows.map((r) => r.serviceId).filter(Boolean);

  try {
    const result = await purgeOrphanRecordings(keep);
    return NextResponse.json({ ok: true, kept: keep.length, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "تعذّر تنظيف الملفات القديمة";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
