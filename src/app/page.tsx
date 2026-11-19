import Link from "next/link";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getLocale, t, waLink } from "@/lib/i18n";
import { viewerCountry, currencyFor } from "@/lib/pricing";
import { buttonVariants } from "@/components/ui/button";
import { LangSwitcher } from "@/components/lang-switcher";
import { cn } from "@/lib/utils";
import { LandingFallback } from "./landing-fallback";

export const dynamic = "force-dynamic";

type LandingData = {
  profile: {
    displayName: string; title: string; bio: string; methodology: string; achievements: string;
    whatsappNumber: string | null;
  } | null;
  courses: Array<{
    id: string; title: string; description: string; level: string; coverColor: string;
    students: number; hasPreview: boolean;
    defaultPrice: number;
    overridePrice: number | null; // for the viewer's country, if set
  }>;
  testimonials: Array<{ id: string; name: string; text: string; level: string | null; rating: number }>;
};

async function loadLanding(): Promise<LandingData & { viewerCountryCode: string }> {
  const locale = await getLocale();
  try {
    const user = await getCurrentUser();
    const h = await headers();
    const country = viewerCountry({
      headerCountry: h.get("cf-ipcountry") ?? h.get("x-country"),
      userCountry: user?.countryCode ?? null,
    });

    const [profile, courses, testimonials] = await Promise.all([
      db.teacherProfile.findFirst(),
      db.course.findMany({
        where: { published: true },
        include: {
          modules: { include: { lessons: { where: { access: "FREE_PREVIEW" } } } },
          prices: { where: { countryCode: country } },
          _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
        },
        orderBy: { createdAt: "desc" },
      }),
      db.testimonial.findMany({ where: { published: true }, orderBy: { createdAt: "desc" }, take: 6 }),
    ]);

    return {
      viewerCountryCode: country,
      profile: profile
        ? {
            displayName: profile.displayName, title: profile.title, bio: profile.bio,
            methodology: profile.methodology, achievements: profile.achievements,
            whatsappNumber: profile.whatsappNumber,
          }
        : null,
      courses: courses.map((c) => ({
        id: c.id, title: c.title, description: c.description, level: c.level,
        coverColor: c.coverColor, students: c._count.enrollments,
        hasPreview: c.modules.some((m) => m.lessons.length > 0),
        defaultPrice: c.price,
        overridePrice: c.prices[0]?.price ?? null,
      })),
      testimonials: testimonials.map((x) => ({ id: x.id, name: x.name, text: x.text, level: x.level, rating: x.rating })),
    };
  } catch {
    return { profile: null, courses: [], testimonials: [], viewerCountryCode: "JO" };
  }
}

function priceLabel(course: LandingData["courses"][number], viewerCountry: string, locale: "ar" | "en"): string {
  if (course.overridePrice === 0 || (!course.overridePrice && course.defaultPrice === 0)) {
    return locale === "ar" ? "مجانية" : "Free";
  }
  // Country override uses the country's currency; default price stays in Jordanian dinar.
  const useOverride = course.overridePrice !== null && course.overridePrice !== course.defaultPrice;
  const price = useOverride ? course.overridePrice! : course.defaultPrice;
  const currency = useOverride ? currencyFor(viewerCountry) : locale === "ar" ? "دينار" : "JOD";
  const perMonth = locale === "ar" ? "/ شهريًا" : "/ month";
  return currency === "$" ? `$${price}${perMonth}` : `${price} ${currency} ${perMonth}`;
}

/** Public landing page: Quran teacher brand, three itqan levels, courses, testimonials. */
export default async function LandingPage() {
  const locale = await getLocale();
  const d = await t();
  const data = await loadLanding();
  if (!data.profile && data.courses.length === 0) {
    return <LandingFallback />;
  }
  const profile = data.profile;
  const achievements = (profile?.achievements ?? "").split("\n").filter(Boolean);
  const wa = profile?.whatsappNumber?.replace(/\D/g, "");

  const waMessage =
    locale === "ar"
      ? "مرحبًا، أرغب بالاستفسار عن دورات تعليم القرآن وإتقانه 🌙"
      : "Hello, I would like to ask about the Quran recitation and Ijazah courses 🌙";
  const waHref = wa ? waLink(wa, waMessage) : null;

  return (
    <main className="min-h-dvh bg-[#faf8f2]">
      {/* ─── Bismillah bar ─── */}
      <div className="bg-emerald-950 py-2.5 text-center">
        <p className="font-display text-sm text-amber-200/95 sm:text-base">{d.bismillah}</p>
      </div>

      {/* ─── Navbar ─── */}
      <nav className="sticky top-0 z-40 border-b border-amber-300/15 bg-emerald-950/95 text-white shadow-md backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2.5 sm:px-6 sm:py-3">
          <Link href="/" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" className="h-9 w-9 sm:h-10 sm:w-10" />
            <span className="font-display text-sm font-extrabold sm:text-base">{profile?.displayName ?? "منصة المعلمة"}</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <LangSwitcher current={locale} />
            <Link href="/login" className="rounded-xl px-3 py-2 text-sm font-bold text-amber-200 transition hover:bg-white/10 sm:px-4">
              {d.login}
            </Link>
            <Link href="/register" className="rounded-xl bg-gradient-to-l from-amber-300 to-amber-400 px-4 py-2 text-sm font-extrabold text-emerald-950 shadow transition hover:from-amber-200 hover:to-amber-300 sm:px-5">
              {d.register}
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-emerald-950 via-emerald-900 to-emerald-950 text-white">
        <div className="pattern-khatam pointer-events-none absolute inset-0 opacity-60" />
        <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-amber-300/10 blur-3xl" />

        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.15fr_1fr] lg:gap-12 lg:py-24">
          {/* Copy */}
          <div className="order-2 text-center lg:order-1 lg:text-right">
            <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-1.5 text-[11px] font-extrabold text-amber-200 sm:text-xs">
              {d.heroBadge}
            </span>
            <h1 className="font-display text-[clamp(1.9rem,6vw,3.4rem)] font-extrabold leading-[1.4]">
              {d.heroTitle1}
              <br />
              <span className="bg-gradient-to-l from-amber-200 via-amber-300 to-amber-400 bg-clip-text text-transparent">
                {d.heroTitle2}
              </span>
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-[clamp(0.95rem,2.2vw,1.15rem)] font-bold leading-8 text-emerald-100/90 lg:mx-0">
              {profile?.title}
            </p>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-8 text-emerald-100/70 sm:leading-8 lg:mx-0">
              {profile?.bio}
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
              <Link href="/register" className={cn(buttonVariants({ size: "lg" }), "bg-gradient-to-l from-amber-300 to-amber-400 text-emerald-950 shadow-xl shadow-amber-500/20 hover:from-amber-200 hover:to-amber-300")}>
                {d.startNow}
              </Link>
              <a href="#levels" className={cn(buttonVariants({ size: "lg" }), "border border-amber-300/30 bg-white/5 text-amber-100 backdrop-blur hover:bg-white/10")}>
                {d.levelsBtn}
              </a>
              {waHref && (
                <a href={waHref} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ size: "lg" }), "border border-emerald-400/30 bg-[#25D366]/15 text-white hover:bg-[#25D366]/25")}>
                  💬 {d.contactAdmin}
                </a>
              )}
            </div>

            {/* trust badges */}
            <div className="mt-8 flex flex-wrap justify-center gap-2 lg:justify-start">
              {d.badges.map((b) => (
                <span key={b} className="rounded-full bg-white/[0.07] px-3.5 py-1.5 text-[11px] font-bold text-emerald-100/85 ring-1 ring-white/10 sm:text-xs">
                  ✓ {b}
                </span>
              ))}
            </div>
          </div>

          {/* Mushaf artwork in ornamental frame */}
          <div className="relative order-1 mx-auto w-full max-w-sm lg:order-2 lg:max-w-md">
            <div className="absolute inset-0 -z-10 translate-y-6 rounded-[3rem] bg-amber-300/10 blur-3xl" />
            <div className="relative rounded-[2rem] border border-amber-300/25 bg-emerald-950/60 p-3 shadow-2xl shadow-black/40 backdrop-blur-sm sm:p-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/mushaf.svg" alt="مصحف مفتوح" className="w-full" />
              <div className="absolute -bottom-5 left-1/2 w-max -translate-x-1/2 rounded-2xl border border-amber-300/25 bg-emerald-950 px-5 py-2.5 text-center shadow-xl">
                <p className="text-[11px] font-extrabold text-amber-200 sm:text-xs">{d.frameTitle}</p>
                <p className="text-[10px] text-emerald-100/60">{d.frameSub}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Stats strip */}
        <div className="relative border-t border-white/10 bg-emerald-950/60">
          <div className="mx-auto grid max-w-4xl grid-cols-2 gap-px sm:grid-cols-4">
            {d.stats.map((s) => (
              <div key={s.label} className="px-4 py-5 text-center sm:py-6">
                <p className="font-display text-2xl font-extrabold text-amber-300 sm:text-3xl">{s.v}</p>
                <p className="mt-1 text-[11px] font-bold text-emerald-100/60 sm:text-xs">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Three levels ─── */}
      <section id="levels" className="pattern-khatam-light relative mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <SectionHeader
          kicker={d.levelsKicker}
          title={d.levelsTitle}
          sub={d.levelsSub}
          light={false}
        />

        <ol className="relative mx-auto max-w-4xl space-y-6 sm:space-y-8">
          <span className="absolute inset-y-8 right-[2.1rem] hidden w-px bg-gradient-to-b from-amber-300/60 via-emerald-300/40 to-amber-300/60 sm:block" aria-hidden />
          {LEVELS.map((l, i) => (
            <li key={l.n} className="relative flex gap-4 sm:gap-7">
              <div className="relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-b from-emerald-800 to-emerald-950 font-display text-2xl font-extrabold text-amber-300 shadow-lg ring-2 ring-amber-300/40 sm:h-[4.25rem] sm:w-[4.25rem] sm:text-3xl">
                {l.n}
              </div>
              <div className="flex-1 rounded-3xl border border-emerald-900/10 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg sm:p-7">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-2xl">{l.icon}</span>
                  <h3 className="font-display text-lg font-extrabold text-emerald-950 sm:text-xl">{d.levelNames[i]}</h3>
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-extrabold text-amber-800 sm:text-xs">{d.levelTags[i]}</span>
                </div>
                <p className="mt-3 text-sm leading-8 text-emerald-900/70 sm:leading-8">{d.levelDescs[i]}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-10 text-center">
          <Link href="/register" className={cn(buttonVariants({ size: "lg" }), "bg-emerald-800 text-white hover:bg-emerald-700")}>
            {d.startLevel1}
          </Link>
        </div>
      </section>

      {/* ─── Methodology ─── */}
      {profile?.methodology && (
        <section className="relative bg-white py-16 sm:py-24">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <SectionHeader kicker={d.methodKicker} title={d.methodTitle} light={false} />
            <div className="relative rounded-3xl border border-amber-200/60 bg-gradient-to-b from-amber-50/70 to-emerald-50/40 p-6 text-sm leading-8 text-emerald-950/85 sm:p-10 sm:leading-9">
              <span className="absolute -top-4 right-8 rounded-full bg-amber-400 px-3 py-1 text-xs font-extrabold text-emerald-950 shadow">{d.methodBadge}</span>
              <p className="whitespace-pre-line">{profile.methodology}</p>
            </div>
          </div>
        </section>
      )}

      {/* ─── Features ─── */}
      <section className="relative overflow-hidden bg-emerald-950 py-16 text-white sm:py-24">
        <div className="pattern-khatam pointer-events-none absolute inset-0 opacity-40" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeader kicker={d.featKicker} title={d.featTitle} light />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <div key={d.featTitles[i]} className="group rounded-3xl border border-white/10 bg-white/[0.06] p-6 backdrop-blur-sm transition hover:-translate-y-1 hover:border-amber-300/30 hover:bg-white/10">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-2xl transition group-hover:bg-amber-300/15">{f.icon}</span>
                <h3 className="mt-4 font-display text-base font-extrabold text-amber-200 sm:text-lg">{d.featTitles[i]}</h3>
                <p className="mt-2 text-sm leading-7 text-emerald-100/70">{d.featDescs[i]}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Courses ─── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <SectionHeader kicker={d.coursesKicker} title={d.coursesTitle} sub={d.coursesSub} light={false} />
        {data.courses.length === 0 ? (
          <p className="rounded-3xl bg-white p-10 text-center text-sm text-emerald-900/60 shadow-sm">{d.noCourses}</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {data.courses.map((c) => (
              <Link key={c.id} href={`/courses/${c.id}`} className="group flex flex-col overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-emerald-900/10 transition hover:-translate-y-1 hover:shadow-xl">
                <div className="h-2.5 w-full" style={{ background: c.coverColor }} />
                <div className="flex flex-1 flex-col p-5 sm:p-6">
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-extrabold text-emerald-800">{c.level}</span>
                    {c.hasPreview && <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-extrabold text-amber-800">{d.previewLesson}</span>}
                  </div>
                  <h3 className="mt-3 font-display text-lg font-extrabold text-emerald-950 transition group-hover:text-emerald-700">{c.title}</h3>
                  <p className="mt-1.5 line-clamp-2 flex-1 text-sm leading-7 text-emerald-900/60">{c.description}</p>
                  <p className="mt-4 text-sm font-extrabold text-emerald-700">
                    {priceLabel(c, data.viewerCountryCode, locale)}
                  </p>
                  <p className="mt-1 text-xs font-bold text-emerald-600/80">{c.students} {d.studentsCount} ←</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ─── Achievements ─── */}
      {achievements.length > 0 && (
        <section className="bg-white py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeader kicker={d.achKicker} title={d.achTitle} light={false} />
            <div className="grid gap-3.5 sm:grid-cols-2">
              {achievements.map((a, i) => (
                <div key={i} className="flex items-start gap-3.5 rounded-2xl border border-emerald-900/10 bg-[#faf8f2] p-4 sm:p-5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-amber-300 to-amber-400 text-emerald-950 shadow-sm">✓</span>
                  <p className="pt-1.5 text-sm font-bold leading-7 text-emerald-950">{a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ─── Testimonials ─── */}
      {data.testimonials.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <SectionHeader kicker={d.testiKicker} title={d.testiTitle} light={false} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.testimonials.map((x) => (
              <figure key={x.id} className="relative flex flex-col rounded-3xl bg-white p-6 shadow-sm ring-1 ring-emerald-900/10 transition hover:-translate-y-1 hover:shadow-lg">
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
        </section>
      )}

      {/* ─── Final CTA ─── */}
      <section className="relative overflow-hidden bg-gradient-to-l from-emerald-950 to-emerald-900 py-16 text-center text-white sm:py-24">
        <div className="pattern-khatam pointer-events-none absolute inset-0 opacity-50" />
        <div className="relative mx-auto max-w-2xl px-4 sm:px-6">
          <p className="font-display text-xl font-bold text-amber-300 sm:text-2xl">{d.ctaAyah}</p>
          <h2 className="mt-5 font-display text-[clamp(1.5rem,4.5vw,2.25rem)] font-extrabold leading-snug">
            {d.ctaTitle}
          </h2>
          <p className="mt-4 text-sm leading-7 text-emerald-100/70 sm:text-base">{d.ctaSub}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/register" className={cn(buttonVariants({ size: "lg" }), "bg-gradient-to-l from-amber-300 to-amber-400 text-emerald-950 shadow-xl shadow-amber-500/20 hover:from-amber-200 hover:to-amber-300")}>
              {d.ctaRegister}
            </Link>
            <Link href="/login" className={cn(buttonVariants({ size: "lg" }), "border border-amber-300/30 bg-white/5 text-amber-100 hover:bg-white/10")}>
              {d.ctaLogin}
            </Link>
            {waHref && (
              <a href={waHref} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ size: "lg" }), "bg-[#25D366] text-white hover:bg-[#1ebe57]")}>
                💬 {d.contactViaWhatsapp}
              </a>
            )}
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-amber-300/10 bg-emerald-950 pb-10 pt-10 text-center text-xs text-emerald-100/50 sm:pb-12">
        <p className="font-display text-lg text-amber-200/90">﷽</p>
        <p className="mt-3 text-sm font-extrabold text-emerald-100/80">{profile?.displayName} — {d.footerBrand}</p>
        <p className="mt-1.5">{profile?.title}</p>
        <p className="mt-4">{d.footerNote}</p>
      </footer>

      {/* ─── Floating WhatsApp ─── */}
      {waHref && (
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

function SectionHeader({ kicker, title, sub, light }: { kicker?: string; title: string; sub?: string; light: boolean }) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center sm:mb-14">
      {kicker && (
        <p className={cn("mb-2 text-xs font-extrabold tracking-widest sm:text-sm", light ? "text-amber-300" : "text-amber-600")}>
          {kicker}
        </p>
      )}
      <h2 className={cn("font-display text-[clamp(1.5rem,4.5vw,2.5rem)] font-extrabold leading-snug", light ? "text-white" : "text-emerald-950")}>
        {title}
      </h2>
      {sub && <p className={cn("mt-3 text-[clamp(0.875rem,2vw,1rem)] leading-7", light ? "text-emerald-100/70" : "text-emerald-900/60")}>{sub}</p>}
      <div className="mt-5 flex items-center justify-center gap-3 text-amber-500">
        <span className="text-lg sm:text-xl" aria-hidden>۞</span>
      </div>
    </div>
  );
}

const LEVELS = [
  { n: "١", icon: "📖" },
  { n: "٢", icon: "🌙" },
  { n: "٣", icon: "📜" },
];

const FEATURES = [
  { icon: "🔴" },
  { icon: "🎧" },
  { icon: "🛡️" },
  { icon: "📝" },
  { icon: "📲" },
  { icon: "🏆" },
];
