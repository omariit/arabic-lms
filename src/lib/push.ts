/**
 * Web Push (VAPID) — server side.
 * Sends push notifications to saved subscriptions (students + staff).
 */
import { sendNotification, setVapidDetails } from "web-push";
import { db } from "@/lib/db";

let configured = false;
function ensureConfigured() {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@muqriah.app";
  if (!publicKey || !privateKey) return false;
  setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export function pushPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

/** Save or refresh a subscription for a user. */
export async function saveSubscription(
  userId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent?: string
) {
  await db.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent?.slice(0, 300) },
    create: {
      userId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent: userAgent?.slice(0, 300),
    },
  });
}

export async function removeSubscription(endpoint: string) {
  await db.pushSubscription.deleteMany({ where: { endpoint } });
}

/** Best-effort push to specific users. 410/404 endpoints are pruned. */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<number> {
  if (!ensureConfigured() || userIds.length === 0) return 0;
  const subs = await db.pushSubscription.findMany({ where: { userId: { in: userIds } } });
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload)
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.pushSubscription.deleteMany({ where: { endpoint: s.endpoint } }).catch(() => {});
        }
      }
    })
  );
  return sent;
}
