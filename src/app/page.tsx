import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getLocale, t, waLink } from "@/lib/i18n";
import { viewerCountry, currencyFor } from "@/lib/pricing";
import { buttonVariants } from "@/components/ui/button";
import { LangSwitcher } from "@/components/lang-switcher";
import { CountUp } from "@/components/count-up";
import { Rich } from "@/components/rich";
import { getSiteData, mergeDicts } from "@/lib/site-content";
import { cn } from "@/lib/utils";
import { LandingFallback } from "./landing-fallback";

export const dynamic = "force-dynamic";

/** The marketing page belongs to visitors. A signed-in user goes to her own
 * dashboard instead of being sent back to the landing page by the logo or the
 * browser's back button. Staff can still preview it with `?preview=1`. */
function homeFor(role: string) {
  return role === "STUDENT" ? "/dashboard" : "/admin";
}

type LandingData = {
  profile: {
    displayName: string; title: string; bio: string; methodology: string; achievements: string;
    whatsappNumber: string | null; photoUrl: string | null;
  } | null;
  courses: Array<{
    id: string; title: string; description: string; level: string; coverColor: string;
    students: number; hasPreview: boolean; lessonCount: number;
    defaultPrice: number; overridePrice: number | null;
  }>;
  testimonials: Array<{ id: string; name: string; text: string; level: string | null; rating: number }>;
  totalStudents: number;
};

async function loadLanding() {
  const locale = await getLocale();
  try {
    const user = await getCurrentUser();
    const h = await headers();
    const country = viewerCountry({
      headerCountry: h.get("cf-ipcountry") ?? h.get("x-country"),
      userCountry: user?.countryCode ?? null,
    });

    const [profile, courses, testimonials, totalStudents] = await Promise.all([
      db.teacherProfile.findFirst(),
      db.course.findMany({
        where: { published: true },
        include: {
          modules: { include: { lessons: true } },
          prices: { where: { countryCode: country } },
          _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
        },
        orderBy: { createdAt: "desc" },
      }),
      db.testimonial.findMany({ where: { published: true }, orderBy: { createdAt: "desc" }, take: 6 }),
      db.enrollment.count({ where: { status: "ACTIVE" } }),
    ]);

    return {
      viewerCountry: country,
      locale,
      profile: profile
        ? {
            displayName: profile.displayName, title: profile.title, bio: profile.bio,
            methodology: profile.methodology, achievements: profile.achievements,
            whatsappNumber: profile.whatsappNumber, photoUrl: profile.photoUrl,
          }
        : null,
      courses: courses.map((c) => ({
        id: c.id, title: c.title, description: c.description, level: c.level,
        coverColor: c.coverColor, students: c._count.enrollments,
        hasPreview: c.modules.some((m) => m.lessons.some((l) => l.access === "FREE_PREVIEW")),
        lessonCount: c.modules.reduce((n, m) => n + m.lessons.length, 0),
        defaultPrice: c.price,
        overridePrice: c.prices[0]?.price ?? null,
      })),
      testimonials: testimonials.map((x) => ({ id: x.id, name: x.name, text: x.text, level: x.level, rating: x.rating })),
      totalStudents,
    };
  } catch {
    return {
      viewerCountry: "JO", locale, profile: null, courses: [], testimonials: [], totalStudents: 0,
    };
  }
}

const LEVEL_ICONS = ["📖", "🌙", "📜"];
const FEATURE_ICONS = ["🔴", "🎧", "🛡️", "📝", "📲", "🏆"];

/** Public landing page — sanad-inspired structure, fully CMS-managed. */
export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  if (!params.preview) {
    const current = await getCurrentUser().catch(() => null);
    if (current) redirect(homeFor(current.role));
  }

  const [{ locale, profile, courses, testimonials, totalStudents, viewerCountry }, site] = await Promise.all([
    loadLanding(),
    getSiteData(),
  ]);
  const base = await t();
  const d = mergeDicts(base, site.texts[locale]);
  const S = site.sections; // section visibility

  if (!profile && courses.length === 0) return <LandingFallback />;
  const ar = locale === "ar";
  const wa = profile?.whatsappNumber?.replace(/\D/g, "");

  const waMessage = ar
    ? "مرحبًا، أرغب بالاستفسار عن دورات تعليم القرآن وإتقانه 🌙"
    : "Hello, I would like to ask about the Quran recitation and Ijazah courses 🌙";
  const waHref = wa ? waLink(wa, waMessage) : null;

  // Structured data for search engines (Organization + Courses)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://arabic-lms-production.up.railway.app";
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "EducationalOrganization",
        "@id": `${baseUrl}/#organization`,
        name: "مُقْرِئَة",
        alternateName: "Muqri'ah",
        url: baseUrl,
        logo: `${baseUrl}/logo-square.png`,
        image: `${baseUrl}/og.png`,
        description: ar
          ? "منصة نسائية متخصصة في إتقان تلاوة القرآن الكريم والقراءات العشر حتى الإجازة بالسند المتصل"
          : "A women's platform dedicated to mastering Quran recitation and the Ten Qira'at up to Ijazah with a connected chain",
      },
      {
        "@type": "Person",
        name: profile?.displayName,
        jobTitle: profile?.title,
        description: profile?.bio,
        worksFor: { "@id": `${baseUrl}/#organization` },
        ...(profile?.photoUrl ? { image: profile.photoUrl } : {}),
      },
      ...courses.map((c) => ({
        "@type": "Course",
        name: c.title,
        description: c.description,
        inLanguage: "ar",
        provider: { "@id": `${baseUrl}/#organization` },
        offers: {
          "@type": "Offer",
          price: c.overridePrice ?? c.defaultPrice,
          priceCurrency:
            c.overridePrice !== null && c.overridePrice !== c.defaultPrice ? currencyFor(viewerCountry) : "JOD",
          category: "Subscription",
        },
        url: `${baseUrl}/courses/${c.id}`,
      })),
    ],
  };

  const achievements = (profile?.achievements ?? "").split("\n").filter(Boolean);
  const heroLines: string[] = Array.isArray(d.heroLines) ? d.heroLines : [];
  const statsValues: number[] = Array.isArray(d.statsValues) ? d.statsValues.map(Number) : [];
  const levelNames = d.levelNames;
  const levelTags = d.levelTags;
  const steps = d.steps;
  const featTitles = d.featTitles;
  const featDescs = d.featDescs;
  const badges = d.badges;
  // first stat = live enrollment count unless the admin set a fixed override
  const stat0 = Number.isFinite(statsValues[0]) && statsValues[0] > 0 ? statsValues[0] : totalStudents;
  const stats: Array<[number, string]> = [
    [stat0, d.statsLabels[0] ?? ""],
    [statsValues[1] ?? 3, d.statsLabels[1] ?? ""],
    [statsValues[2] ?? 10, d.statsLabels[2] ?? ""],
    [statsValues[3] ?? 15, d.statsLabels[3] ?? ""],
  ];

  return (
    <main className="min-h-dvh bg-[#faf8f2]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* ─── Bismillah bar ─── */}
      <div className="bg-emerald-950 py-2.5 text-center">
        <p className="font-display text-sm text-amber-200/95 sm:text-base">{d.bismillah}</p>
      </div>

      {/* ─── Navbar ─── */}
      <nav className="sticky top-0 z-40 border-b border-emerald-900/10 bg-white/95 text-emerald-950 shadow-sm backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2.5 sm:px-6 sm:py-3">
          <Link href="/" className="flex items-center gap-2 pr-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="مُقْرِئَة" className="h-12 w-auto sm:h-14" />
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <LangSwitcher current={locale} />
            <Link href="/login" className="rounded-xl border border-emerald-800/20 px-3.5 py-2 text-sm font-bold text-emerald-900 transition hover:bg-emerald-50 sm:px-4">
              {d.login}
            </Link>
            <Link href="/register" className="rounded-xl bg-emerald-800 px-4 py-2 text-sm font-extrabold text-white shadow transition hover:bg-emerald-700 sm:px-5">
              {d.register}
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── Hero (full-bleed, trateel-style) ─── */}
      {S.hero && (
      <section className="relative overflow-hidden bg-gradient-to-bl from-emerald-950 via-emerald-900 to-emerald-950 text-white">
        <div className="pattern-khatam pointer-events-none absolute inset-0 opacity-40" />
        <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[36rem] -translate-x-1/2 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-4 pb-28 pt-14 sm:px-6 sm:pb-40 sm:pt-20">
          <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
            <div className="order-2 text-center lg:order-1 lg:text-right">
              <p className="mb-3 font-display text-lg font-bold text-amber-300/90 sm:text-xl">{d.siteName}</p>
              <h1 className="font-display text-[clamp(1.9rem,5.5vw,3.2rem)] font-extrabold leading-[1.55] text-white">
                {heroLines.map((line, i) => (
                  <span key={i} className={cn(i > 0 && "block")}>
                    <Rich text={line} dark />
                  </span>
                ))}
              </h1>
              <p className="mx-auto mt-4 max-w-xl text-sm leading-8 text-emerald-100/80 lg:mx-0">{profile?.title}</p>
              <div className="mt-7 flex flex-wrap justify-center gap-3 lg:justify-start">
                <Link href="/register" className={cn(buttonVariants({ size: "lg" }), "bg-white text-emerald-950 shadow-xl hover:bg-amber-50")}>
                  {d.startNow}
                </Link>
                <a href="#levels" className={cn(buttonVariants({ size: "lg" }), "border border-white/25 bg-white/10 text-white hover:bg-white/15")}>
                  {d.levelsBtn}
                </a>
                {waHref && (
                  <a href={waHref} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ size: "lg" }), "bg-[#25D366] text-white shadow-lg hover:bg-[#1ebe57]")}>
                    💬 {d.contactAdmin}
                  </a>
                )}
              </div>
              <div className="mt-7 flex flex-wrap justify-center gap-2 lg:justify-start">
                {badges.map((b) => (
                  <span key={b} className="rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-[11px] font-bold text-emerald-100/85 sm:text-xs">
                    ✓ {b}
                  </span>
                ))}
              </div>
            </div>

            {/* Mushaf artwork */}
            <div className="relative order-1 mx-auto hidden w-full max-w-sm lg:order-2 lg:block xl:max-w-md">
              <div className="absolute inset-0 -z-10 translate-y-6 rounded-[3rem] bg-emerald-500/15 blur-3xl" />
              <div className="relative rounded-[2rem] border border-white/10 bg-white/[0.06] p-3 shadow-2xl backdrop-blur-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/mushaf.svg" alt="مصحف مفتوح" className="w-full" />
                <div className="absolute -bottom-5 left-1/2 w-max -translate-x-1/2 rounded-2xl border border-amber-300/30 bg-emerald-950 px-5 py-2.5 text-center shadow-xl">
                  <p className="text-[11px] font-extrabold text-amber-200 sm:text-xs">{d.frameTitle}</p>
                  <p className="text-[10px] text-emerald-100/60">{d.frameSub}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      )}

      {/* ─── Navy intro card overlapping the hero (trateel-style) ─── */}
      {S.hero && (
      <div className="relative z-10 mx-auto -mt-16 max-w-4xl px-4 sm:-mt-24 sm:px-6">
        <div className="relative overflow-hidden rounded-[2rem] bg-[#182a52] p-6 text-white shadow-2xl sm:p-10">
          <div className="pattern-khatam pointer-events-none absolute inset-0 opacity-25" />
          <div className="relative">
            <div className="flex items-center justify-center gap-3">
              <span className="rounded-full bg-amber-400 px-4 py-1 text-xs font-extrabold text-emerald-950">{d.aboutPill}</span>
            </div>
            <h2 className="mt-4 text-center font-display text-xl font-extrabold sm:text-2xl">{d.aboutCardTitle}</h2>
            <p className="mt-4 text-center text-sm leading-8 text-white/80 sm:leading-8">{profile?.bio}</p>
          </div>
        </div>
      </div>
      )}

      {/* ─── Three levels: program cards ─── */}
      {S.levels && (
      <section id="levels" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto mb-10 max-w-2xl text-center sm:mb-14">
          <p className="mb-2 text-xs font-extrabold tracking-widest text-amber-600 sm:text-sm">{d.levelsKicker}</p>
          <h2 className="font-display text-[clamp(1.5rem,4.5vw,2.4rem)] font-extrabold leading-snug text-emerald-950">
            <Rich text={d.levelsTitle} /> <Rich text={d.levelsTitleHl} />
          </h2>
          {d.levelsSub && <p className="mt-3 text-[clamp(0.875rem,2vw,1rem)] leading-7 text-emerald-900/60">{d.levelsSub}</p>}
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {levelNames.map((name, i) => (
            <div key={name} className="group relative flex flex-col overflow-hidden rounded-3xl border border-emerald-900/10 bg-white shadow-sm transition hover:-translate-y-1.5 hover:shadow-xl">
              <div className="relative bg-gradient-to-b from-emerald-950 to-emerald-900 px-6 pb-8 pt-7 text-center text-white">
                <div className="pattern-khatam pointer-events-none absolute inset-0 opacity-40" />
                <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-300 font-display text-3xl font-extrabold text-emerald-950 shadow-lg">
                  {LEVEL_ICONS[i]}
                </div>
                <h3 className="relative mt-3 font-display text-lg font-extrabold">{name}</h3>
                <p className="relative mt-1 text-xs font-bold text-amber-200/90">{levelTags[i]}</p>
              </div>
              <ul className="flex-1 space-y-2.5 px-6 py-5 text-sm text-emerald-900/75">
                {(ar
                  ? ["تسميع مباشر ومعتمد", "متابعة فردية دورية", "تقييم قبل الانتقال"]
                  : ["Direct certified recitation", "Regular 1-on-1 follow-up", "Evaluation before advancing"]
                ).map((f) => (
                  <li key={f} className="flex items-center gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-extrabold text-amber-700">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <div className="px-6 pb-6">
                <Link href="/register" className={cn(buttonVariants({ size: "sm" }), "w-full bg-emerald-800 hover:bg-emerald-700")}>
                  {ar ? "سجلي في هذا المستوى" : "Enroll in this level"}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>
      )}

      {/* ─── Navy band CTA ─── */}
      {S.band && (
      <section className="bg-[#faf8f2] py-2">
        <div className="mx-auto max-w-6xl px-4 pb-6 sm:px-6">
          <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-l from-emerald-950 to-emerald-900 py-12 text-center text-white sm:py-16">
            <div className="pattern-khatam pointer-events-none absolute inset-0 opacity-40" />
            <div className="relative mx-auto max-w-2xl px-4">
              <h2 className="font-display text-[clamp(1.5rem,4.5vw,2.4rem)] font-extrabold">
                <Rich text={d.bandTitle} dark />
              </h2>
              <p className="mt-3 text-sm text-emerald-100/75 sm:text-base">{d.bandSub}</p>
              <Link href="/register" className={cn(buttonVariants({ size: "lg" }), "mt-6 bg-white text-emerald-950 shadow-xl hover:bg-amber-50")}>
                {d.ctaRegister}
              </Link>
            </div>
          </div>
        </div>
      </section>
      )}

      {/* ─── Meet the teacher ─── */}
      {S.teacher && (
      <section className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto mb-10 max-w-2xl text-center sm:mb-14">
            <p className="mb-2 text-xs font-extrabold tracking-widest text-amber-600 sm:text-sm">{d.aboutKicker}</p>
            <h2 className="font-display text-[clamp(1.5rem,4.5vw,2.4rem)] font-extrabold leading-snug text-emerald-950">
              <Rich text={d.aboutTitle} /> <Rich text={d.meetTeacherHl} />
            </h2>
          </div>
          <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:items-start sm:gap-10 sm:text-right">
            <div className="relative shrink-0">
              <div className="absolute -inset-2 rounded-full border-2 border-dashed border-amber-300/70" aria-hidden />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={profile?.photoUrl || "/teacher-avatar.svg"}
                alt={profile?.displayName ?? ""}
                className="relative h-40 w-40 rounded-full border-4 border-white object-cover shadow-xl sm:h-52 sm:w-52"
              />
            </div>
            <div className="max-w-2xl">
              <h3 className="font-display text-2xl font-extrabold text-emerald-950">{profile?.displayName}</h3>
              <p className="mt-1 text-sm font-extrabold text-amber-600">{profile?.title}</p>
              <p className="mt-4 text-sm leading-8 text-emerald-900/75">{profile?.bio}</p>
              {achievements.length > 0 && (
                <div className="mt-5 flex flex-wrap justify-center gap-2 sm:justify-start">
                  {achievements.slice(0, 4).map((a, i) => (
                    <span key={i} className="rounded-full bg-amber-50 px-3 py-1.5 text-[11px] font-bold text-emerald-900 ring-1 ring-amber-200">
                      🏅 {a}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
      )}

      {/* ─── Stats counters ─── */}
      {S.stats && (
      <section className="pattern-khatam-light bg-[#f2efe6] py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="mx-auto mb-10 max-w-2xl text-center sm:mb-14">
            <p className="mb-2 text-xs font-extrabold tracking-widest text-amber-600 sm:text-sm">{d.statsKicker}</p>
            <h2 className="font-display text-[clamp(1.5rem,4.5vw,2.4rem)] font-extrabold leading-snug text-emerald-950"><Rich text={d.statsTitle} /></h2>
          </div>
          {totalStudents === 0 && (
            <p className="mx-auto mb-6 w-max max-w-full rounded-full border border-amber-300 bg-amber-50 px-4 py-1.5 text-center text-[11px] font-extrabold text-amber-700 sm:text-xs">
              🌱 {d.statsBeta}
            </p>
          )}
          <div className={cn("grid grid-cols-2 gap-4", totalStudents > 0 ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
            {stats
              .filter(([value]) => value > 0)
              .map(([value, label], i) => (
                <StatCard key={i} value={<CountUp to={value} arabicIndic={ar} suffix={i === stats.length - 1 ? "+" : ""} />} label={label} />
              ))}
          </div>
        </div>
      </section>
      )}

      {/* ─── How the platform works (circular icons, trateel-style) ─── */}
      {S.steps && (
      <section className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <p className="mb-2 text-xs font-extrabold tracking-widest text-amber-600 sm:text-sm">{d.howKicker}</p>
            <h2 className="font-display text-[clamp(1.5rem,4.5vw,2.4rem)] font-extrabold leading-snug text-emerald-950"><Rich text={d.howTitle} /></h2>
            {d.stepsSub && <p className="mt-3 text-sm leading-7 text-emerald-900/60">{d.stepsSub}</p>}
          </div>
          <div className="grid grid-cols-1 gap-x-4 gap-y-10 sm:grid-cols-3">
            {steps.map((s, i) => (
              <div key={s.t} className="text-center">
                <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-b from-emerald-800 to-emerald-950 shadow-lg shadow-emerald-900/20">
                  <span className="font-display text-2xl font-extrabold text-amber-300">{ar ? ["١", "٢", "٣"][i] : i + 1}</span>
                </div>
                <h3 className="mt-4 font-display text-sm font-extrabold text-emerald-950 sm:text-base">{s.t}</h3>
                <p className="mx-auto mt-1.5 max-w-[14rem] text-xs leading-6 text-emerald-900/60">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* ─── Why section (navy rounded card with checkmarks, trateel-style) ─── */}
      {S.features && (
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-bl from-emerald-950 via-emerald-900 to-[#182a52] p-6 text-white sm:p-12">
          <div className="pattern-khatam pointer-events-none absolute inset-0 opacity-30" />
          <div className="relative mx-auto mb-10 max-w-2xl text-center">
            <h2 className="font-display text-[clamp(1.5rem,4.5vw,2.4rem)] font-extrabold leading-snug"><Rich text={d.featTitle} dark /></h2>
            {d.featSub && <p className="mt-3 text-sm leading-7 text-emerald-100/70">{d.featSub}</p>}
          </div>
          <div className="relative grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            {featTitles.map((title, i) => (
              <div key={title} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-400 text-[10px] font-extrabold text-emerald-950">✓</span>
                <div>
                  <h3 className="text-sm font-extrabold text-amber-200 sm:text-[15px]">{title}</h3>
                  <p className="mt-1 text-xs leading-6 text-emerald-100/65">{featDescs[i]}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* ─── Courses ─── */}
      {S.courses && (
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto mb-10 max-w-2xl text-center sm:mb-14">
          <p className="mb-2 text-xs font-extrabold tracking-widest text-amber-600 sm:text-sm">{d.coursesKicker}</p>
          <h2 className="font-display text-[clamp(1.5rem,4.5vw,2.4rem)] font-extrabold leading-snug text-emerald-950"><Rich text={d.coursesTitle} /></h2>
          {d.coursesSub && <p className="mt-3 text-[clamp(0.875rem,2vw,1rem)] leading-7 text-emerald-900/60">{d.coursesSub}</p>}
        </div>
        {courses.length === 0 ? (
          <p className="rounded-3xl bg-white p-10 text-center text-sm text-emerald-900/60 shadow-sm">{d.noCourses}</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((c) => {
              const useOverride = c.overridePrice !== null && c.overridePrice !== c.defaultPrice;
              const price = useOverride ? c.overridePrice! : c.defaultPrice;
              const currency = useOverride ? currencyFor(viewerCountry) : ar ? "دينار" : "JOD";
              const priceLabel = price === 0
                ? (ar ? "مجانية" : "Free")
                : currency === "$" ? `$${price}` : `${price} ${currency}`;
              return (
                <Link key={c.id} href={`/courses/${c.id}`} className="group flex flex-col overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-emerald-900/10 transition hover:-translate-y-1 hover:shadow-xl">
                  <div className="relative bg-gradient-to-b from-emerald-950 to-emerald-900 px-5 pt-5 text-white">
                    <div className="pattern-khatam pointer-events-none absolute inset-0 opacity-30" />
                    <div className="relative flex items-center justify-between">
                      <span className="rounded-full bg-amber-300 px-3 py-1 text-[11px] font-extrabold text-emerald-950">{c.level}</span>
                      {c.hasPreview && <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold">{d.previewLesson}</span>}
                    </div>
                    <h3 className="relative mt-3 font-display text-lg font-extrabold leading-8">{c.title}</h3>
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <p className="line-clamp-2 flex-1 text-sm leading-7 text-emerald-900/60">{c.description}</p>
                    <div className="mt-4 flex items-center justify-between border-t border-emerald-900/5 pt-4">
                      <p className="text-sm font-extrabold text-emerald-700">
                        {price === 0 ? priceLabel : <>{priceLabel} <span className="text-xs font-bold text-emerald-600/80">{d.monthly}</span></>}
                      </p>
                      <p className="text-xs font-bold text-emerald-900/50">{c.students} {d.studentsCount}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
      )}

      {/* ─── Methodology ─── */}
      {S.methodology && profile?.methodology && (
        <section className="pattern-khatam-light bg-[#f2efe6] py-16 sm:py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <div className="mx-auto mb-10 max-w-2xl text-center sm:mb-14">
              <p className="mb-2 text-xs font-extrabold tracking-widest text-amber-600 sm:text-sm">{d.methodKicker}</p>
              <h2 className="font-display text-[clamp(1.5rem,4.5vw,2.4rem)] font-extrabold leading-snug text-emerald-950"><Rich text={d.methodTitle} /></h2>
            </div>
            <div className="relative rounded-3xl border border-amber-200/60 bg-white p-6 text-sm leading-8 text-emerald-950/85 shadow-sm sm:p-10 sm:leading-9">
              <span className="absolute -top-4 right-8 rounded-full bg-amber-400 px-3 py-1 text-xs font-extrabold text-emerald-950 shadow">{d.methodBadge}</span>
              <p className="whitespace-pre-line">{profile.methodology}</p>
            </div>
          </div>
        </section>
      )}

      {/* ─── Testimonials ─── */}
      {S.testimonials && testimonials.length > 0 && (
        <section className="bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto mb-10 max-w-2xl text-center sm:mb-14">
              <p className="mb-2 text-xs font-extrabold tracking-widest text-amber-600 sm:text-sm">{d.testiKicker}</p>
              <h2 className="font-display text-[clamp(1.5rem,4.5vw,2.4rem)] font-extrabold leading-snug text-emerald-950"><Rich text={d.testiTitle} /></h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {testimonials.map((x) => (
                <figure key={x.id} className="relative flex flex-col rounded-3xl border border-emerald-900/10 bg-[#faf8f2] p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
                  <span className="absolute -top-3 left-6 font-display text-4xl text-amber-300" aria-hidden>”</span>
                  <div className="mb-3 text-amber-400" aria-label={`${x.rating} / 5`}>
                    {"★".repeat(x.rating)}{"☆".repeat(5 - x.rating)}
                  </div>
                  <blockquote className="flex-1 text-sm leading-8 text-emerald-950/85">{x.text}</blockquote>
                  <figcaption className="mt-5 border-t border-emerald-900/5 pt-4">
                    <p className="text-sm font-extrabold text-emerald-950">{x.name}</p>
                    {x.level && <p className="mt-0.5 text-[11px] font-bold text-amber-700">{x.level}</p>}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ─── Final CTA ─── */}
      {S.finalCta && (
      <section className="relative overflow-hidden bg-gradient-to-l from-emerald-950 to-emerald-900 py-16 text-center text-white sm:py-20">
        <div className="pattern-khatam pointer-events-none absolute inset-0 opacity-50" />
        <div className="relative mx-auto max-w-2xl px-4 sm:px-6">
          <p className="font-display text-xl font-bold text-amber-300 sm:text-2xl">{d.ctaAyah}</p>
          <h2 className="mt-5 font-display text-[clamp(1.5rem,4.5vw,2.25rem)] font-extrabold leading-snug">{d.ctaTitle}</h2>
          <p className="mt-4 text-sm leading-7 text-emerald-100/70 sm:text-base">{d.ctaSub}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/register" className={cn(buttonVariants({ size: "lg" }), "bg-gradient-to-l from-amber-300 to-amber-400 text-emerald-950 shadow-xl shadow-amber-500/20 hover:from-amber-200 hover:to-amber-300")}>
              {d.ctaRegister}
            </Link>
            <Link href="/login" className={cn(buttonVariants({ size: "lg" }), "border border-amber-300/30 bg-white/5 text-amber-100 hover:bg-white/10")}>
              {d.ctaLogin}
            </Link>
          </div>
        </div>
      </section>
      )}

      {/* ─── Footer ─── */}
      <footer className="border-t border-emerald-900/10 bg-emerald-950 pb-10 pt-10 text-center text-xs text-emerald-100/50 sm:pb-12">
        <p className="font-display text-lg text-amber-200/90">﷽</p>
        <p className="mt-3 text-sm font-extrabold text-emerald-100/80">{d.siteName} — منصة {profile?.displayName}</p>
        <p className="mt-1.5">{profile?.title}</p>
        <p className="mt-4">{d.footerNote}</p>
      </footer>

      {/* ─── Floating WhatsApp ─── */}
      {S.whatsappFloat && waHref && (
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={d.contactAdmin}
          className="fixed bottom-5 left-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-2xl text-white shadow-2xl shadow-black/30 transition hover:scale-105 hover:bg-[#1ebe57]"
        >
          💬
        </a>
      )}
    </main>
  );
}

function StatCard({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="rounded-3xl border border-emerald-900/10 bg-white p-6 text-center shadow-sm sm:p-8">
      <p className="font-display text-4xl font-extrabold text-emerald-800 sm:text-5xl">{value}</p>
      <p className="mt-2 text-xs font-bold text-emerald-900/55 sm:text-sm">{label}</p>
    </div>
  );
}
