import type { Metadata, Viewport } from "next";
import { Cairo, Tajawal } from "next/font/google";
import { getLocale, dir } from "@/lib/i18n";
import "./globals.css";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-cairo",
  display: "swap",
});

const tajawal = Tajawal({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700", "800"],
  variable: "--font-tajawal",
  display: "swap",
});

export const metadata: Metadata = {
  title: "مُقْرِئَة | منصة إتقان القرآن — حتى الإجازة",
  description: "منصة مُقْرِئَة: تعلّمي القرآن وإتقان تلاوتك على يد معلمة معتمدة — دروس مسجلة، حصص مباشرة، واختبارات إلكترونية وصوتية",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#1d5fe0",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} dir={dir(locale)} className={`${cairo.variable} ${tajawal.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
