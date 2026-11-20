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

/**
 * Device fingerprint: browser family + OS family only.
 *
 * Deliberately NOT built from `accept-language`, `sec-ch-ua-platform`, IP or full
 * UA strings. Those change on their own (Chromium's UA reduction, a language
 * switch, a mobile network hop, a browser update) and used to invalidate an
 * otherwise-valid session — which surfaced as "suddenly every API returns 401".
 * Single-device enforcement is handled by deactivating older sessions at login.
 */
export function fingerprintFrom(parts: {
  userAgent: string;
  /** Kept for logging only; never part of the hash. */
  ip?: string;
  acceptLanguage?: string;
  platform?: string;
}): string {
  const ua = (parts.userAgent || "").toLowerCase();
  const browser = /edg\//.test(ua)
    ? "edge"
    : /opr\//.test(ua)
      ? "opera"
      : /chrome|crios/.test(ua)
        ? "chrome"
        : /firefox|fxios/.test(ua)
          ? "firefox"
          : /safari/.test(ua)
            ? "safari"
            : "other";
  const os = /windows/.test(ua)
    ? "windows"
    : /android/.test(ua)
      ? "android"
      : /iphone|ipad|ipod/.test(ua)
        ? "ios"
        : /mac os x|macintosh/.test(ua)
          ? "macos"
          : /linux/.test(ua)
            ? "linux"
            : "other";
  return createHash("sha256").update(`${browser}|${os}`).digest("hex");
}

export const SESSION_COOKIE = "lms_session";
export const SESSION_TTL = 60 * 60 * 24 * 14; // 14 days
