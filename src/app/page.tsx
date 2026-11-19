import Link from "next/link";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getLocale, t, waLink } from "@/lib/i18n";
import { viewerCountry, currencyFor } from "@/lib/pricing";
import { buttonVariants } from "@/components/ui/button";
import { LangSwitcher } from "@/components/lang-switcher";
import { CountUp } from "@/components/count-up";
import { cn } from "@/lib/utils";
import { LandingFallback } from "./landing-fallback";

export const dynamic = "force-dynamic";

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

/* ─── atoms ─────────────────────────────────────────── */

/** Yellow word-highlight (sanad-style) */
function HL({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <span className={cn(
      "mx-1 inline-block rounded-lg px-2.5 py-0.5 text-emerald-950",
      dark ? "bg-amber-400" : "bg-amber-300"
    )}>
      {children}
    </span>
  );
}

function SectionTitle({ kicker, title, sub, light = false, highlight }: {
  kicker?: string; title: React.ReactNode; sub?: string; light?: boolean; highlight?: React.ReactNode;
}) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center sm:mb-14">
      {kicker && (
        <p className={cn("mb-2 text-xs font-extrabold tracking-widest sm:text-sm", light ? "text-amber-300" : "text-amber-600")}>
          {kicker}
        </p>
      )}
      <h2 className={cn("font-display text-[clamp(1.5rem,4.5vw,2.4rem)] font-extrabold leading-snug", light ? "text-white" : "text-emerald-950")}>
        {title} {highlight && <HL dark={light}>{highlight}</HL>}
      </h2>
      {sub && <p className={cn("mt-3 text-[clamp(0.875rem,2vw,1rem)] leading-7", light ? "text-emerald-100/70" : "text-emerald-900/60")}>{sub}</p>}
    </div>
  );
}

const LEVELS = [
  { n: "١", icon: "📖" },
  { n: "٢", icon: "🌙" },
  { n: "٣", icon: "📜" },
];

const FEATURES = [
  { icon: "🔴" }, { icon: "🎧" }, { icon: "🛡️" }, { icon: "📝" }, { icon: "📲" }, { icon: "🏆" },
];

/** Public landing page — sanad-inspired structure, Quran-platform identity. */
export default async function LandingPage() {
  const { locale, profile, courses, testimonials, totalStudents, viewerCountry } = await loadLanding();
  const d = await t();
  if (!profile && courses.length === 0) return <LandingFallback />;
  const ar = locale === "ar";
  const achievements = (profile?.achievements ?? "").split("\n").filter(Boolean);
  const wa = profile?.whatsappNumber?.replace(/\D/g, "");

  const waMessage = ar
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
      <nav className="sticky top-0 z-40 border-b border-emerald-900/10 bg-white/95 text-emerald-950 shadow-sm backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2.5 sm:px-6 sm:py-3">
          <Link href="/" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" className="h-9 w-9 sm:h-10 sm:w-10" />
            <span className="font-display text-sm font-extrabold sm:text-base">{profile?.displayName}</span>
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

      {/* ─── Hero (light, sanad-style: copy right, visual left) ─── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-white to-[#f2efe6]">
        <div className="pattern-khatam-light pointer-events-none absolute inset-0 opacity-70" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-2 lg:gap-14 lg:py-20">
          {/* Copy */}
          <div className="order-2 text-center lg:order-1 lg:text-right">
            <h1 className="font-display text-[clamp(1.8rem,5.5vw,3rem)] font-extrabold leading-[1.5] text-emerald-950">
              {ar ? "منصّة لأتقان" : "A platform to master"}
              <br />
              {ar ? <>تلاوة <HL>القرآنِ الكريم</HL> وتتلمذي</> : <>your <HL>Quran</HL> recitation</>}
              <br />
              {ar ? <>في أي <HL>مكانٍ</HL> وأي <HL>وقتٍ</HL></> : <>anywhere, <HL>anytime</HL></>}
              <br />
              <span className="text-emerald-700">
                {ar ? <>…حتى <HL>الإجازة</HL></> : <>…all the way to <HL>Ijazah</HL></>}
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-sm leading-8 text-emerald-900/70 sm:leading-8 lg:mx-0">
              {profile?.title}
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3 lg:justify-start">
              <Link href="/register" className={cn(buttonVariants({ size: "lg" }), "bg-emerald-800 text-white shadow-lg shadow-emerald-800/25 hover:bg-emerald-700")}>
                {d.startNow}
              </Link>
              <a href="#levels" className={cn(buttonVariants({ size: "lg" }), "border-2 border-emerald-800/25 bg-white text-emerald-900 hover:bg-emerald-50")}>
                {d.levelsBtn}
              </a>
              {waHref && (
                <a href={waHref} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ size: "lg" }), "bg-[#25D366] text-white shadow-lg hover:bg-[#1ebe57]")}>
                  💬 {d.contactAdmin}
                </a>
              )}
            </div>
            <div className="mt-7 flex flex-wrap justify-center gap-2 lg:justify-start">
              {d.badges.map((b) => (
                <span key={b} className="rounded-full bg-emerald-900/[0.06] px-3.5 py-1.5 text-[11px] font-bold text-emerald-900/80 ring-1 ring-emerald-900/10 sm:text-xs">
                  ✓ {b}
                </span>
              ))}
            </div>
          </div>

          {/* Mushaf artwork */}
          <div className="relative order-1 mx-auto w-full max-w-xs sm:max-w-sm lg:order-2 lg:max-w-md">
            <div className="absolute inset-0 -z-10 translate-y-8 rounded-[3rem] bg-emerald-700/10 blur-3xl" />
            <div className="relative rounded-[2rem] border border-emerald-900/10 bg-emerald-950 p-3 shadow-2xl shadow-emerald-900/30 sm:p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/mushaf.svg" alt="مصحف مفتوح" className="w-full" />
              <div className="absolute -bottom-5 left-1/2 w-max -translate-x-1/2 rounded-2xl border border-amber-300/30 bg-emerald-950 px-5 py-2.5 text-center shadow-xl">
                <p className="text-[11px] font-extrabold text-amber-200 sm:text-xs">{d.frameTitle}</p>
                <p className="text-[10px] text-emerald-100/60">{d.frameSub}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Three levels: program cards (sanad-style) ─── */}
      <section id="levels" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <SectionTitle kicker={d.levelsKicker} title={d.levelsTitle} sub={d.levelsSub} />

        <div className="grid gap-5 md:grid-cols-3">
          {d.levelNames.map((name, i) => (
            <div key={name} className="group relative flex flex-col overflow-hidden rounded-3xl border border-emerald-900/10 bg-white shadow-sm transition hover:-translate-y-1.5 hover:shadow-xl">
              {/* program logo header */}
              <div className="relative bg-gradient-to-b from-emerald-950 to-emerald-900 px-6 pb-8 pt-7 text-center text-white">
                <div className="pattern-khatam pointer-events-none absolute inset-0 opacity-40" />
                <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-300 font-display text-3xl font-extrabold text-emerald-950 shadow-lg">
                  {LEVELS[i].icon}
                </div>
                <h3 className="relative mt-3 font-display text-lg font-extrabold">{name}</h3>
                <p className="relative mt-1 text-xs font-bold text-amber-200/90">{d.levelTags[i]}</p>
              </div>
              {/* feature list */}
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

      {/* ─── Navy band CTA (sanad-style) ─── */}
      <section className="relative overflow-hidden bg-emerald-950 py-12 text-center text-white sm:py-16">
        <div className="pattern-khatam pointer-events-none absolute inset-0 opacity-40" />
        <div className="relative mx-auto max-w-2xl px-4">
          <h2 className="font-display text-[clamp(1.5rem,4.5vw,2.4rem)] font-extrabold">
            {ar ? <>مسار <HL dark>إتقان</HL> متكامل</> : <>A complete <HL dark>mastery</HL> path</>}
          </h2>
          <p className="mt-3 text-sm text-emerald-100/75 sm:text-base">
            {ar ? "برنامج متكامل لتعليم التلاوة المتقنة وإتقان القراءات المهنّد من الإجازة" : "A complete program for precise recitation and certified qira'at, ending in Ijazah"}
          </p>
          <Link href="/register" className={cn(buttonVariants({ size: "lg" }), "mt-6 border-2 border-amber-300/40 bg-white/5 text-amber-100 hover:bg-white/10")}>
            {d.ctaRegister}
          </Link>
        </div>
      </section>

      {/* ─── Meet the teacher (circular photo, sanad instructors style) ─── */}
      <section className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionTitle kicker={d.aboutKicker} title={d.aboutTitle} highlight={d.meetTeacher} />
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

      {/* ─── Stats counters ─── */}
      <section className="pattern-khatam-light bg-[#f2efe6] py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <SectionTitle kicker={d.statsKicker} title={d.statsTitle} />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard value={<CountUp to={totalStudents} arabicIndic={ar} />} label={d.statsLabels[0]} />
            <StatCard value={<CountUp to={3} arabicIndic={ar} />} label={d.statsLabels[1]} />
            <StatCard value={<CountUp to={10} arabicIndic={ar} />} label={d.statsLabels[2]} />
            <StatCard value={<CountUp to={15} suffix="+" arabicIndic={ar} />} label={d.statsLabels[3]} />
          </div>
        </div>
      </section>

      {/* ─── How to start (3 steps) ─── */}
      <section className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <SectionTitle kicker={d.stepsKicker} title={d.stepsTitle} />
          <div className="grid gap-5 sm:grid-cols-3">
            {d.steps.map((s, i) => (
              <div key={s.t} className="relative rounded-3xl border border-emerald-900/10 bg-[#faf8f2] p-6 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-b from-emerald-800 to-emerald-950 font-display text-xl font-extrabold text-amber-300 shadow-lg">
                  {ar ? ["١", "٢", "٣"][i] : i + 1}
                </div>
                <h3 className="mt-4 font-display text-base font-extrabold text-emerald-950 sm:text-lg">{s.t}</h3>
                <p className="mt-2 text-sm leading-7 text-emerald-900/65">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features (dark) ─── */}
      <section className="relative overflow-hidden bg-emerald-950 py-16 text-white sm:py-20">
        <div className="pattern-khatam pointer-events-none absolute inset-0 opacity-40" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <SectionTitle light kicker={d.featKicker} title={d.featTitle} />
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
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <SectionTitle kicker={d.coursesKicker} title={d.coursesTitle} sub={d.coursesSub} />
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

      {/* ─── Methodology ─── */}
      {profile?.methodology && (
        <section className="pattern-khatam-light bg-[#f2efe6] py-16 sm:py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <SectionTitle kicker={d.methodKicker} title={d.methodTitle} />
            <div className="relative rounded-3xl border border-amber-200/60 bg-white p-6 text-sm leading-8 text-emerald-950/85 shadow-sm sm:p-10 sm:leading-9">
              <span className="absolute -top-4 right-8 rounded-full bg-amber-400 px-3 py-1 text-xs font-extrabold text-emerald-950 shadow">{d.methodBadge}</span>
              <p className="whitespace-pre-line">{profile.methodology}</p>
            </div>
          </div>
        </section>
      )}

      {/* ─── Testimonials ─── */}
      {testimonials.length > 0 && (
        <section className="bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionTitle kicker={d.testiKicker} title={d.testiTitle} />
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

      {/* ─── Footer ─── */}
      <footer className="border-t border-emerald-900/10 bg-emerald-950 pb-10 pt-10 text-center text-xs text-emerald-100/50 sm:pb-12">
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

function StatCard({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="rounded-3xl border border-emerald-900/10 bg-white p-6 text-center shadow-sm sm:p-8">
      <p className="font-display text-4xl font-extrabold text-emerald-800 sm:text-5xl">{value}</p>
      <p className="mt-2 text-xs font-bold text-emerald-900/55 sm:text-sm">{label}</p>
    </div>
  );
}
