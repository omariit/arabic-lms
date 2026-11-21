import Link from "next/link";
import { StudentNav } from "@/components/student-nav";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { viewerCountry, currencyFor } from "@/lib/pricing";
import { countryName } from "@/lib/phone";
import { getLocale } from "@/lib/i18n";
import { presignGet, r2Configured } from "@/lib/r2";
import { Badge, Card, CardContent } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://arabic-lms-production.up.railway.app";

export const metadata: Metadata = {
  title: "الدورات المتاحة",
  description: "دورات تحفيظ وتجويد وإتقان القراءات وإجازة القراءة بالمستويات الثلاثة مع أ. خولة حتاملة.",
  alternates: { canonical: "/courses" },
  openGraph: {
    title: "الدورات المتاحة | مُقْرِئَة",
    description: "دورات تحفيظ وتجويد وإتقان القراءات وإجازة القراءة بالمستويات الثلاثة.",
    url: `${BASE_URL}/courses`,
    images: ["/og.png"],
    type: "website",
  },
};

/** Public catalog: every published course with its price for the visitor's country. */
export default async function CoursesPage() {
  const [locale, country] = await Promise.all([getLocale(), viewerCountry({})]);
  const courses = await db.course
    .findMany({
      where: { published: true },
      orderBy: [{ createdAt: "asc" }],
      select: {
        id: true,
        title: true,
        description: true,
        level: true,
        price: true,
        coverColor: true,
        coverImageKey: true,
        prices: { where: { countryCode: country }, select: { price: true } },
        _count: { select: { modules: true, enrollments: true } },
        modules: { select: { _count: { select: { lessons: true } } } },
      },
    })
    .catch(() => []);

  const curated = await Promise.all(
    courses.map(async (c) => ({
      ...c,
      coverUrl: c.coverImageKey && r2Configured() ? await presignGet(c.coverImageKey, 900).catch(() => null) : null,
      authed: c.prices.length > 0,
      effective: c.prices[0]?.price ?? c.price,
    })),
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <StudentNav />
      <header className="mb-8 text-center">
        <h1 className="text-2xl font-extrabold text-brand-900 sm:text-3xl">الدورات المتاحة</h1>
        <p className="mt-2 text-sm text-gray-600">
          اختاري المستوى المناسب لك — كل دورة بمسار متدرّج وتقييم صوتي فردي.
        </p>
      </header>

      {curated.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-gray-500">
            لا دورات منشورة بعد — تابعينا قريبًا.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {curated.map((c) => (
            <Link key={c.id} href={`/courses/${c.id}`} className="group">
              <Card className="h-full overflow-hidden transition group-hover:-translate-y-0.5 group-hover:shadow-lg">
                <div className="relative aspect-[16/9] w-full overflow-hidden" style={{ background: c.coverColor }}>
                  {c.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.coverUrl} alt={c.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-4xl">📖</div>
                  )}
                  <span className="absolute start-3 top-3">
                    <Badge tone="brand">{c.level}</Badge>
                  </span>
                </div>
                <CardContent className="py-4">
                  <h2 className="text-base font-extrabold text-brand-900 group-hover:underline">{c.title}</h2>
                  <p className="mt-1 line-clamp-2 text-xs text-gray-600">{c.description}</p>
                  <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                    <span>
                      {c._count.modules} أقسام · {c.modules.reduce((s, m) => s + m._count.lessons, 0)} دروس
                    </span>
                    <span className="font-extrabold text-brand-700">
                      {c.effective > 0
                        ? `${c.effective} ${currencyFor(country)} / شهريًا`
                        : "مجانية"}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-gray-400">
                    {c._count.enrollments > 0
                      ? `${c._count.enrollments} طالبة مسجّلة · السعر بـ${countryName(country, locale)}`
                      : `السعر بـ${countryName(country, locale)}`}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <div className={cn("mt-10 rounded-2xl border border-brand-100 bg-brand-50/60 p-5 text-center")}>
        <p className="text-sm font-bold text-brand-900">عندك سؤال قبل التسجيل؟</p>
        <p className="mt-1 text-xs text-brand-900/70">
          سجّلي حسابًا مجانيًا وابدئي محادثة مع المعلمة أو الإدارة من داخل المنصة.
        </p>
        <Link href="/register" className="mt-3 inline-block rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-700">
          إنشاء حساب
        </Link>
      </div>
    </main>
  );
}
