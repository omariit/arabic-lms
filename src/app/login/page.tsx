import { db } from "@/lib/db";
import { loginErrorMessage } from "@/lib/login-messages";
import { LoginForm } from "./login-form";

export const metadata = { robots: { index: true, follow: true } };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Sign-in page. Server-rendered so that:
 *  • the "forgot password" link can point at the teacher's real WhatsApp number,
 *  • errors from the no-JavaScript form POST are visible even with scripts off.
 */
export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;

  const profile = await db.teacherProfile
    .findFirst({ select: { whatsappNumber: true } })
    .catch(() => null);

  // Railway exposes the environment name at runtime; staging must never be
  // mistaken for production (that caused a "wrong password" report once).
  const envName = (process.env.RAILWAY_ENVIRONMENT_NAME ?? "").toLowerCase();
  const isStaging = envName.includes("stag") || envName.includes("dev") || envName.includes("preview");

  const initialError = loginErrorMessage(one(params.error) ?? null, one(params.left) ?? null, one(params.wait) ?? null);
  const next = one(params.next) ?? "";
  const nextPath = next.startsWith("/") && !next.startsWith("//") ? next : "";

  return (
    <LoginForm
      supportWhatsapp={profile?.whatsappNumber ?? ""}
      stagingBanner={isStaging}
      initialError={initialError}
      initialNext={nextPath}
      initialExpired={one(params.expired) !== undefined}
    />
  );
}
