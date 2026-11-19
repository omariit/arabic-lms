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

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://arabic-lms-production.up.railway.app";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "مُقْرِئَة | منصة إتقان القرآن — حتى الإجازة",
    template: "%s | مُقْرِئَة",
  },
  description:
    "منصة مُقْرِئَة: تعلّمي القرآن وإتقان تلاوتك على يد معلمة إجازة معتمدة — دروس مسجلة، حصص مباشرة، تصحيح صوتي فردي، واختبارات إلكترونية وصوتية حتى الإجازة بالسند المتصل.",
  keywords: [
    "تعليم القرآن للنساء",
    "إتقان القرآن",
    "تلاوة القرآن",
    "دورات تجويد اونلاين",
    "القراءات العشر",
    "الإجازة بالسند",
    "معلمة قرآن أونلاين",
    "قراءة القرآن بالتجويد",
    "تعلم القرآن عن بعد",
    "Quran ijazah for women",
    "online Quran tajweed",
  ],
  applicationName: "مُقْرِئَة",
  manifest: "/manifest.json",
  alternates: {
    canonical: "/",
    languages: { ar: "/", en: "/" },
  },
  openGraph: {
    type: "website",
    siteName: "مُقْرِئَة",
    title: "مُقْرِئَة | منصة إتقان القرآن — حتى الإجازة",
    description:
      "تعلّمي القرآن وإتقان تلاوتك على يد معلمة إجازة معتمدة — دروس، حصص مباشرة، وتصحيح صوتي فردي حتى الإجازة بالسند المتصل.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "مُقْرِئَة — منصة إتقان القرآن" }],
    locale: "ar_JO",
    alternateLocale: ["en_US"],
  },
  twitter: {
    card: "summary_large_image",
    title: "مُقْرِئَة | منصة إتقان القرآن — حتى الإجازة",
    description: "تعلّمي القرآن وإتقان تلاوتك — دروس، حصص مباشرة، وتصحيح صوتي فردي حتى الإجازة.",
    images: ["/og.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  icons: { icon: "/icon.svg", apple: "/logo-square.png" },
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
