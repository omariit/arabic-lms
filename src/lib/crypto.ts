import { createHash, createHmac, timingSafeEqual, randomBytes } from "crypto";

const SECRET = process.env.AUTH_SECRET || "";

// Lazily enforced at request time (see ensureSecret) so build-time page-data
// collection does not fail; production must still provide AUTH_SECRET.
function ensureSecret() {
  if (!SECRET && process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is required in production");
  }
}
const effectiveSecret = SECRET || "dev-insecure-secret-do-not-use-in-prod";

/** HMAC-SHA256 signature helpers (constant-time compare). */
export function sign(payload: string): string {
  ensureSecret();
  return createHmac("sha256", effectiveSecret).update(payload).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Compact signed token: base64url(jsonPayload).hmac — used for sessions & short-lived grants. */
export function encodeToken(data: Record<string, unknown>, ttlSeconds: number): string {
  const body = { ...data, jti: randomBytes(12).toString("hex"), iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeToken<T = Record<string, unknown>>(token: string): T | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!safeEqual(sign(payload), sig)) return null;
  try {
    const body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof body.exp === "number" && body.exp < Math.floor(Date.now() / 1000)) return null;
    return body as T;
  } catch {
    return null;
  }
}

/** Device fingerprint: SHA-256 of stable client characteristics + IP. */
export function fingerprintFrom(parts: {
  userAgent: string;
  /** Kept for logging only — NOT part of the hash: mobile IPs rotate on every
   * network switch (4G/Wi-Fi), which would silently log real users out. */
  ip?: string;
  acceptLanguage?: string;
  platform?: string;
}): string {
  const raw = `${parts.userAgent}|${parts.acceptLanguage ?? ""}|${parts.platform ?? ""}`;
  return createHash("sha256").update(raw).digest("hex");
}

export const SESSION_COOKIE = "lms_session";
export const SESSION_TTL = 60 * 60 * 24 * 14; // 14 days
