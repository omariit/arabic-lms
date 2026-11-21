import { NextResponse } from "next/server";
import { clientMeta } from "@/lib/auth";
import { attemptLogin, homeFor } from "@/lib/auth-login";

/** JSON sign-in used by the hydrated login form. */
export async function POST(req: Request) {
  const { ip } = await clientMeta();
  const body = (await req.json().catch(() => ({}))) as {
    phone?: string;
    password?: string;
    countryCode?: string;
  };

  const result = await attemptLogin({ ...body, ip });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code, attemptsLeft: result.attemptsLeft, retryAfter: result.retryAfter },
      { status: result.status, headers: result.retryAfter ? { "Retry-After": String(result.retryAfter) } : undefined },
    );
  }

  const { createSession } = await import("@/lib/auth");
  await createSession(result.user.id);

  return NextResponse.json({
    ok: true,
    role: result.user.role,
    redirect: homeFor(result.user.role),
  });
}
