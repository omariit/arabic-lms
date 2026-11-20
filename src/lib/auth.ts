import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  SESSION_COOKIE,
  SESSION_TTL,
  decodeToken,
  encodeToken,
  fingerprintFrom,
} from "@/lib/crypto";
import type { Role } from "@prisma/client";

export type SessionUser = { id: string; role: Role; fullName: string; phone: string; countryCode: string };

export async function clientMeta() {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "0.0.0.0";
  const userAgent = h.get("user-agent") ?? "unknown";
  const acceptLanguage = h.get("accept-language") ?? "";
  const platform = h.get("sec-ch-ua-platform") ?? "";
  return { ip, userAgent, acceptLanguage, platform };
}

/** Create a DB session (killing all previous sessions of the user = single-device lock) and set the HTTP-only cookie. */
export async function createSession(userId: string) {
  const { ip, userAgent, acceptLanguage, platform } = await clientMeta();
  const fp = fingerprintFrom({ userAgent, ip, acceptLanguage, platform });
  // Single-device enforcement: deactivate every other session for this user.
  await db.session.updateMany({ where: { userId, active: true }, data: { active: false } });
  const session = await db.session.create({
    data: {
      userId,
      deviceFingerprint: fp,
      ipAddress: ip,
      userAgent: userAgent.slice(0, 300),
      expiresAt: new Date(Date.now() + SESSION_TTL * 1000),
    },
  });
  const token = encodeToken({ sid: session.id, uid: userId }, SESSION_TTL);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL,
  });
  return session.id;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const body = decodeToken<{ sid: string }>(token);
    if (body?.sid) {
      await db.session.updateMany({ where: { id: body.sid }, data: { active: false } });
    }
  }
  jar.delete(SESSION_COOKIE);
}

/** Resolve the current user with strict device validation. Returns null when anything fails. */
export async function getCurrentUser(opts?: { allowFresh?: boolean }): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const body = decodeToken<{ sid: string; uid: string }>(token);
  if (!body?.sid) return null;

  const session = await db.session.findUnique({ where: { id: body.sid } });
  if (!session || !session.active || session.expiresAt < new Date()) return null;

  const { ip, userAgent, acceptLanguage, platform } = await clientMeta();
  const fp = fingerprintFrom({ userAgent, ip, acceptLanguage, platform });
  if (fp !== session.deviceFingerprint) {
    // Record it for auditing, then heal instead of killing: a changed browser
    // build (or a session created before the fingerprint algorithm changed) must
    // not log a real student out mid-lesson. Sharing is still blocked because
    // createSession() deactivates every other session of the user.
    await db.securityViolation.create({
      data: { userId: session.userId, type: "DEVICE_MISMATCH", detail: JSON.stringify({ ip }), ipAddress: ip },
    }).catch(() => {});
    await db.session.update({ where: { id: session.id }, data: { deviceFingerprint: fp, userAgent: userAgent.slice(0, 300) } }).catch(() => {});
  }

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, role: true, fullName: true, phone: true, countryCode: true },
  });
  if (!user) return null;
  return { id: user.id, role: user.role, fullName: user.fullName, phone: user.phone, countryCode: user.countryCode };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");
  return user;
}

/** Teacher areas: the TEACHER or the platform ADMIN (oversight). ASSISTANT cannot enter. */
export async function requireTeacher(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "TEACHER" && user.role !== "ADMIN") redirect("/dashboard");
  return user;
}

/** Staff shell: TEACHER + ADMIN + ASSISTANT (teaching assistant). The assistant
 * only gets the chat inbox (layout nav filters by role). */
export async function requireStaff(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "STUDENT") redirect("/dashboard");
  return user;
}

export async function requireStudent(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "STUDENT") redirect("/admin");
  return user;
}

/** API-route guard returning a Response instead of redirecting.
 * need: "any" | "ADMIN" (platform owner only) | "TEACHER" (TEACHER or ADMIN)
 * | "STAFF" (TEACHER, ADMIN or ASSISTANT) | "STUDENT". */
export async function apiUser(need: "any" | "ADMIN" | "TEACHER" | "STAFF" | "STUDENT" = "any") {
  const user = await getCurrentUser();
  if (!user) return { user: null, error: Response.json({ error: "غير مصرح" }, { status: 401 }) };
  if (need === "ADMIN" && user.role !== "ADMIN")
    return { user: null, error: Response.json({ error: "لمدير المنصة فقط" }, { status: 403 }) };
  if (need === "TEACHER" && user.role !== "TEACHER" && user.role !== "ADMIN")
    return { user: null, error: Response.json({ error: "للمعلمة فقط" }, { status: 403 }) };
  if (need === "STAFF" && user.role === "STUDENT")
    return { user: null, error: Response.json({ error: "لفريق العمل فقط" }, { status: 403 }) };
  if (need === "STUDENT" && user.role !== "STUDENT")
    return { user: null, error: Response.json({ error: "للطالبات فقط" }, { status: 403 }) };
  return { user, error: null };
}
