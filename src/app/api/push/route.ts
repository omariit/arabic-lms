import { NextResponse } from "next/server";
import { apiUser, clientMeta } from "@/lib/auth";
import { pushPublicKey, saveSubscription, removeSubscription } from "@/lib/push";

/** Public VAPID key for the client. */
export async function GET() {
  const { error } = await apiUser("any");
  if (error) return error;
  return NextResponse.json({ publicKey: pushPublicKey() });
}

/** Save a browser push subscription for the signed-in user. */
export async function POST(req: Request) {
  const { user, error } = await apiUser("any");
  if (error) return error;
  const body = (await req.json().catch(() => ({}))) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json({ error: "بيانات الاشتراك ناقصة" }, { status: 400 });
  }
  const meta = await clientMeta();
  await saveSubscription(
    user.id,
    { endpoint: body.endpoint, keys: { p256dh: body.keys.p256dh, auth: body.keys.auth } },
    meta.userAgent
  );
  return NextResponse.json({ ok: true });
}

/** Remove a subscription (user turned notifications off). */
export async function DELETE(req: Request) {
  const { error } = await apiUser("any");
  if (error) return error;
  const body = (await req.json().catch(() => ({}))) as { endpoint?: string };
  if (body.endpoint) await removeSubscription(body.endpoint);
  return NextResponse.json({ ok: true });
}
