import { NextResponse } from "next/server";
import { createHmac, randomUUID } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

/**
 * ICE servers for the WebRTC rooms.
 *
 * STUN is public and enough for most home networks; corporate/mobile networks need
 * a relay. Instead of shipping a permanent TURN password to every browser, the
 * server mints short-lived coturn credentials (the standard `use-auth-secret`
 * scheme: username = "<expiry>:<id>", credential = HMAC-SHA1(secret, username)).
 *
 * Environment:
 *   TURN_URLS       turn:host:3478,turns:host:5349   (comma separated)
 *   TURN_SECRET     the coturn `static-auth-secret`
 *   TURN_TTL_SEC    credential lifetime, default 3600
 * Falls back to `NEXT_PUBLIC_TURN_URL` + user/pass for simple setups.
 */
export async function GET() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    // Guests with an invite are allowed too; the ICE list is not a secret.
    // Rate limit keeps casual scraping cheap.
  }
  const rl = rateLimit(`ice:${user?.id ?? "anon"}`, 60, 60_000);
  if (!rl.ok) return NextResponse.json({ iceServers: [] }, { status: 429 });

  const iceServers: RTCIceServer[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ];

  const urls = (process.env.TURN_URLS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const secret = process.env.TURN_SECRET ?? "";

  if (urls.length && secret) {
    const ttl = Math.max(60, Number(process.env.TURN_TTL_SEC ?? 3600));
    const username = `${Math.floor(Date.now() / 1000) + ttl}:${randomUUID()}`;
    const credential = createHmac("sha1", secret).update(username).digest("base64");
    iceServers.push({ urls, username, credential });
  } else if (process.env.NEXT_PUBLIC_TURN_URL) {
    iceServers.push({
      urls: process.env.NEXT_PUBLIC_TURN_URL.split(",").map((s) => s.trim()),
      username: process.env.NEXT_PUBLIC_TURN_USER ?? "",
      credential: process.env.NEXT_PUBLIC_TURN_PASS ?? "",
    });
  }

  return NextResponse.json(
    { iceServers, hasRelay: iceServers.length > 1 },
    { headers: { "cache-control": "no-store" } },
  );
}
