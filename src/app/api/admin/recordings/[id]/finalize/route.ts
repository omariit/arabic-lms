import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { finalizeRemote, recordingConfigured, recordingView, syncRecording } from "@/lib/recording";

/** Staff: close the upload and let the recording service build the MP4. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await apiUser("STAFF");
  if (error || !user) return error!;
  const { id } = await ctx.params;

  const row = await db.recordingSession.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "التسجيل غير موجود" }, { status: 404 });
  if (user.role !== "ADMIN" && row.teacherId !== user.id) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }
  if (row.status === "READY") return NextResponse.json({ recording: recordingView(row), already: true });
  if (!recordingConfigured()) return NextResponse.json({ error: "خدمة التسجيل غير مفعّلة" }, { status: 503 });

  try {
    const { state } = await finalizeRemote(row.serviceId);
    const updated = await syncRecording(row, state);
    return NextResponse.json({ recording: recordingView(updated) }, { status: 202 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "تعذّر إنهاء التسجيل";
    // 400 (nothing uploaded) / 409 (missing chunks) are actionable for the teacher,
    // not server faults — pass them through so the UI can explain what to do.
    const status = (e as { status?: number }).status ?? 502;
    const passThrough = [400, 404, 409].includes(status) ? status : 502;
    return NextResponse.json({ error: message }, { status: passThrough });
  }
}
