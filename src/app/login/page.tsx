import { db } from "@/lib/db";
import { LoginForm } from "./login-form";

export const metadata = { robots: { index: true, follow: true } };

/** Sign-in page. Server-rendered so the "forgot password" link can point at the
 * teacher's real WhatsApp number (she sets it in إعداداتي). */
export default async function LoginPage() {
  const profile = await db.teacherProfile.findFirst({ select: { whatsappNumber: true } }).catch(() => null);

  return <LoginForm supportWhatsapp={profile?.whatsappNumber ?? ""} />;
}
