import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { abortRemote, recordingConfigured, recordingView, syncRecording } from "@/lib/recording";

/** Staff: throw away the recording (no video produced, files cleaned). */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await apiUser("STAFF");
  if (error || !user) return error!;
  const { id } = await ctx.params;

  const row = await db.recordingSession.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "التسجيل غير موجود" }, { status: 404 });
  if (user.role !== "ADMIN" && row.teacherId !== user.id) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 403 });
  }

  if (recordingConfigured()) {
    try {
      const { state } = await abortRemote(row.serviceId);
      const updated = await syncRecording(row, state);
      return NextResponse.json({ recording: recordingView(updated) });
    } catch {
      /* fall through to the local status change */
    }
  }
  const updated = await db.recordingSession.update({
    where: { id },
    data: { status: "ABORTED", stage: "aborted", errorMessage: "أُلغي التسجيل" },
  });
  return NextResponse.json({ recording: recordingView(updated) });
}
