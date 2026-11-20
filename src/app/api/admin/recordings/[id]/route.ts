import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import {
  ACTIVE_STATUSES,
  deleteRemote,
  fetchRemoteState,
  mintTokens,
  recordingConfigured,
  recordingView,
  syncRecording,
} from "@/lib/recording";

async function loadOwned(id: string, user: { id: string; role: string }) {
  const row = await db.recordingSession.findUnique({ where: { id } });
  if (!row) return { row: null as null, deny: NextResponse.json({ error: "التسجيل غير موجود" }, { status: 404 }) };
  if (user.role !== "ADMIN" && row.teacherId !== user.id) {
    return { row: null as null, deny: NextResponse.json({ error: "غير مصرح" }, { status: 403 }) };
  }
  return { row, deny: null as null };
}

/** Staff: session health (DB row refreshed from the service when still in flight). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await apiUser("STAFF");
  if (error || !user) return error!;
  const { id } = await ctx.params;
  const { row, deny } = await loadOwned(id, user);
  if (deny) return deny;

  let current = row!;
  let disk: number | null = null;
  if (recordingConfigured()) {
    try {
      const { state, disk: usage } = await fetchRemoteState(current.serviceId);
      current = await syncRecording(current, state);
      disk = usage ? Math.round(usage.usedPct) : null;
    } catch {
      /* service asleep — the DB row is still the source of truth we show */
    }
  }
  return NextResponse.json({
    configured: recordingConfigured(),
    diskUsedPct: disk,
    recording: recordingView(current),
    inFlight: ACTIVE_STATUSES.includes(current.status),
  });
}

/** Staff: refresh short-lived tokens (upload after a long lesson / playback). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await apiUser("STAFF");
  if (error || !user) return error!;
  const { id } = await ctx.params;
  const { row, deny } = await loadOwned(id, user);
  if (deny) return deny;

  const body = (await req.json().catch(() => ({}))) as { kind?: "upload" | "view" };
  try {
    // The service's token endpoint issues both kinds; upload needs the teacher's uid.
    const { token } = await mintTokens(row!.serviceId, body.kind === "upload" ? 12 * 3600 : 6 * 3600);
    return NextResponse.json({ token });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "تعذّر إصدار التوكن" }, { status: 502 });
  }
}

/** Staff: delete the recording (service files + row). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await apiUser("STAFF");
  if (error || !user) return error!;
  const { id } = await ctx.params;
  const { row, deny } = await loadOwned(id, user);
  if (deny) return deny;

  if (recordingConfigured()) {
    await deleteRemote(row!.serviceId).catch(() => {});
  }
  await db.recordingSession.delete({ where: { id: row!.id } });
  return NextResponse.json({ ok: true });
}
