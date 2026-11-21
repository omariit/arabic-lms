import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth";
import { recordingConfigured, warmRecordingService } from "@/lib/recording";

/**
 * Wake the recording service before a lesson.
 *
 * The service runs with Railway "app sleeping" (scale to zero), so the first hit
 * after an idle night can take 10–30s. The studio calls this first and shows
 * «نُجهّز خدمة التسجيل…» instead of a failure, then starts the recording.
 */
export async function POST() {
  const { user, error } = await apiUser("STAFF");
  if (error || !user) return error!;
  if (user.role === "ASSISTANT") {
    return NextResponse.json({ error: "التسجيل متاح للمعلمة والإدارة فقط" }, { status: 403 });
  }
  if (!recordingConfigured()) {
    return NextResponse.json({ error: "خدمة التسجيل غير مفعّلة على الخادم" }, { status: 503 });
  }

  try {
    const { awake, ms } = await warmRecordingService(75_000);
    return NextResponse.json({ awake, ms, cold: ms > 1500 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "خدمة التسجيل لا تستجيب";
    return NextResponse.json({ error: message, awake: false }, { status: 503 });
  }
}

/** Cheap status for the studio banner (does not wait for a wake-up). */
export async function GET() {
  const { user, error } = await apiUser("STAFF");
  if (error || !user) return error!;
  if (!recordingConfigured()) return NextResponse.json({ configured: false, awake: false });
  try {
    const res = await fetch(`${(process.env.RECORDING_SERVICE_URL ?? "").replace(/\/+$/, "")}/health`, {
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    return NextResponse.json({ configured: true, awake: res.ok });
  } catch {
    // Slept containers do not answer at all — that is the normal idle state.
    return NextResponse.json({ configured: true, awake: false, sleeping: true });
  }
}
