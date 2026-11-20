import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "lms_session";

/**
 * Edge middleware: coarse route protection (cookie presence + validity of the
 * signed token's signature/expiry via Web Crypto). Full DB device validation
 * happens server-side in `getCurrentUser`.
 */
async function verifyTokenShape(token: string): Promise<{ sid?: string; uid?: string } | null> {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const enc = new TextEncoder();
  const secret = process.env.AUTH_SECRET || "dev-insecure-secret-do-not-use-in-prod";
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  if (expected !== sig) return null;
  try {
    const body = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    if (typeof body.exp !== "number" || body.exp < Math.floor(Date.now() / 1000)) return null;
    return body;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifyTokenShape(token) : null;

  const isAdminArea = pathname.startsWith("/admin") || pathname.startsWith("/api/admin");
  const isStudentArea = pathname.startsWith("/dashboard") || pathname.startsWith("/lesson") || pathname.startsWith("/exam") || pathname.startsWith("/live");
  // Public invite links for the meeting room: the page itself validates the token
  // (and the Socket.io handshake re-validates it before any media is exchanged).
  const isInvitedGuest = pathname.startsWith("/live/") && req.nextUrl.searchParams.has("invite");

  if ((isAdminArea || isStudentArea) && !isInvitedGuest) {
    if (!session) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      // A cookie that is present but no longer valid = expired/revoked session:
      // say so instead of showing a blank login form.
      const expired = token ? "&expired=1" : "";
      url.search = `?next=${encodeURIComponent(pathname)}${expired}`;
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
      }
      return NextResponse.redirect(url);
    }
  }
  if (pathname === "/login" && session && !pathname.startsWith("/api/")) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/dashboard/:path*", "/lesson/:path*", "/exam/:path*", "/live/:path*", "/api/admin/:path*", "/login"],
};
