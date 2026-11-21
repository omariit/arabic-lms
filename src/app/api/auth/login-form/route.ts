import { NextResponse } from "next/server";
import { clientMeta } from "@/lib/auth";
import { attemptLogin, homeFor } from "@/lib/auth-login";

/**
 * Sign-in without JavaScript.
 *
 * A cached/old bundle, a blocked script, or a tap before hydration used to leave
 * the login page looking "broken" (a disabled button). This endpoint accepts a
 * plain HTML form POST, so signing in works even when no client JavaScript runs.
 * Passwords never travel in the URL: the form is method="post".
 */
/**
 * Public origin of this request. Behind Railway's proxy `req.url` is the internal
 * address (http://localhost:PORT/...), so redirecting with it sent the browser to
 * localhost (ERR_CONNECTION_REFUSED). Prefer the forwarded host headers.
 */
function publicUrl(req: Request, path: string) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const base = host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
  return new URL(path, base);
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.redirect(publicUrl(req, "/login?error=missing"), 303);
  }

  const phone = String(form.get("phone") ?? "");
  const password = String(form.get("password") ?? "");
  const countryCode = String(form.get("countryCode") ?? "JO");
  const next = String(form.get("next") ?? "");

  const { ip } = await clientMeta();
  const result = await attemptLogin({ phone, password, countryCode, ip });

  if (!result.ok) {
    const params = new URLSearchParams({ error: result.code });
    if (result.attemptsLeft !== undefined) params.set("left", String(result.attemptsLeft));
    if (result.retryAfter) params.set("wait", String(result.retryAfter));
    if (next) params.set("next", next);
    return NextResponse.redirect(publicUrl(req, `/login?${params.toString()}`), 303);
  }

  const { createSession } = await import("@/lib/auth");
  await createSession(result.user.id);

  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : homeFor(result.user.role);
  return NextResponse.redirect(publicUrl(req, safeNext), 303);
}
