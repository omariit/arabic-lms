import { db } from "@/lib/db";
import { LoginForm } from "./login-form";

export const metadata = { robots: { index: true, follow: true } };

/** Sign-in page. Server-rendered so the "forgot password" link can point at the
 * teacher's real WhatsApp number (she sets it in إعداداتي). */
export default async function LoginPage() {
  const profile = await db.teacherProfile.findFirst({ select: { whatsappNumber: true } }).catch(() => null);
  // Railway exposes the environment name at runtime; staging must never be
  // mistaken for production (that caused a "wrong password" report once).
  const envName = (process.env.RAILWAY_ENVIRONMENT_NAME ?? "").toLowerCase();
  const isStaging = envName.includes("stag") || envName.includes("dev") || envName.includes("preview");

  return <LoginForm supportWhatsapp={profile?.whatsappNumber ?? ""} stagingBanner={isStaging} />;
}
