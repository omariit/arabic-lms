import Link from "next/link";
import { db } from "@/lib/db";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LandingFallback } from "./landing-fallback";

export const dynamic = "force-dynamic";

type LandingData = {
  profile: {
    displayName: string; title: string; bio: string; methodology: string; achievements: string;
  } | null;
  courses: Array<{
    id: string; title: string; description: string; price: number; level: string; coverColor: string;
    students: number; hasPreview: boolean;
  }>;
  testimonials: Array<{ id: string; name: string; text: string; level: string | null; rating: number }>;
};

async function loadLanding(): Promise<LandingData> {
  try {
    const [profile, courses, testimonials] = await Promise.all([
      db.teacherProfile.findFirst(),
      db.course.findMany({
        where: { published: true },
        include: {
          modules: { include: { lessons: { where: { access: "FREE_PREVIEW" } } } },
          _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
        },
        orderBy: { createdAt: "desc" },
      }),
      db.testimonial.findMany({ where: { published: true }, orderBy: { createdAt: "desc" }, take: 6 }),
    ]);
    return {
      profile: profile
        ? {
            displayName: profile.displayName, title: profile.title, bio: profile.bio,
            methodology: profile.methodology, achievements: profile.achievements,
          }
        : null,
      courses: courses.map((c) => ({
        id: c.id, title: c.title, description: c.description, price: c.price, level: c.level,
        coverColor: c.coverColor, students: c._count.enrollments,
        hasPreview: c.modules.some((m) => m.lessons.length > 0),
      })),
      testimonials: testimonials.map((t) => ({ id: t.id, name: t.name, text: t.text, level: t.level, rating: t.rating })),
    };
  } catch {
    // Graceful fallback when the database is unreachable (e.g., cold deploy / maintenance).
    return { profile: null, courses: [], testimonials: [] };
  }
}

/** Public landing page: Quran teacher brand, three itqan levels, courses, testimonials. */
export default async function LandingPage() {
  const data = await loadLanding();
  if (!data.profile && data.courses.length === 0) {
    return <LandingFallback />;
  }
  const profile = data.profile;
  const achievements = (profile?.achievements ?? "").split("\n").filter(Boolean);

  const LEVELS = [
    {
      n: "١", name: "المستوى الأول — الإتقان", icon: "📖",
      desc: "تأسيس النطق الصحيح وضبط مخارج الحروف، وتلاوة القرآن بأحكام التجويد من الكتاب بإتقان تام.",
    },
    {
      n: "٢", name: "المستوى الثاني — القراءات", icon: "🌙",
      desc: "القراءات العشر من طريق الشاطبية والدرة، مع التسمع المباشر والتصحيح التفصيلي لكل قراءة.",
    },
    {
      n: "٣", name: "المستوى الثالث — الإجازة", icon: "📜",
      desc: "رواية القرآن وإتقانه بالمستوى الثالث: الإجازة بالسند المتصل المتصل إلى رسول الله ﷺ مع توثيق السند.",
    },
  ];

  const FEATURES = [
    { icon: "🔴", title: "حصص مباشرة تفاعلية", desc: "بث مباشر داخل المنصة مع غرفة صوتية للسؤال والجواب — صوت المعلمة واضح وبدون تشويش." },
    { icon: "🎧", title: "تصحيح صوتي فردي", desc: "تسجّلين تلاوتك من جوالك، وتريدينها على المعلمة، وتصلك ملاحظاتها وتصحيحها صوتيًا." },
    { icon: "🛡️", title: "منصة آمنة للنساء", desc: "المحتوى محمي بعلامة مائية باسمك، والدخول بحساب خاص — بيئة متواضعة مخصصة للأخت والبنت." },
    { icon: "📝", title: "اختبارات ومتابعة", desc: "اختبارات إلكترونية فورية على التجويد والقواعد، واختبارات تلاوة صوتية يصححها بنفسها." },
    { icon: "📲", title: "من جوالك بسهولة", desc: "ثبّتي المنصة على شاشتك الرئيسية مثل التطبيق — كل شيء بضغطة زر واحدة." },
    { icon: "🏆", title: "توثيق الإجازة", desc: "عند إتمام كل مستوى: تقييم نهائي، ثم إجازة موثقة بالسند للطالبة المتقنة." },
  ];

  return (
    <main className="min-h-dvh bg-[#f6f9f7]">
      {/* ─── Top bismillah bar ─── */}
      <div className="bg-gradient-to-l from-emerald-950 via-emerald-900 to-emerald-950 py-2 text-center">
        <p className="text-sm text-amber-200/90 font-display tracking-wide">
          ﷽ — بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
        </p>
      </div>

      {/* ─── Navbar ─── */}
      <nav className="sticky top-0 z-40 border-b border-emerald-900/10 bg-emerald-950/95 text-white backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" className="h-9 w-9" />
            <span className="text-sm font-extrabold">{profile?.displayName ?? "منصة المعلمة"}</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-bold text-amber-200 hover:bg-white/10">دخول</Link>
            <Link href="/register" className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-extrabold text-emerald-950 hover:bg-amber-300">حساب جديد</Link>
          </div>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-emerald-950 via-emerald-900 to-emerald-950 text-white">
        {/* subtle geometric pattern */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 25% 25%, #f5d576 1.5px, transparent 1.5px), radial-gradient(circle at 75% 75%, #f5d576 1.5px, transparent 1.5px)",
            backgroundSize: "56px 56px",
          }}
        />
        <div className="relative mx-auto grid max-w-5xl items-center gap-8 px-4 py-14 sm:py-20 md:grid-cols-2">
          <div className="text-center md:text-right">
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-amber-300/10 px-4 py-1.5 text-xs font-bold text-amber-200">
              ✨ إجازة بالسند المتصل — للنساء والبنات
            </span>
            <h1 className="text-3xl font-extrabold leading-[1.35] sm:text-4xl sm:leading-[1.35]">
              إتقاني قراءتك… <span className="text-amber-300">وتوصلي للإجازة</span>
            </h1>
            <p className="mt-3 text-lg font-bold text-emerald-100/90">
              {profile?.title ?? "معلمة قراءات وإتقان وإجازة القراءة بالمستويات الثلاثة"}
            </p>
            <p className="mt-4 text-sm leading-8 text-emerald-100/75 sm:leading-8">
              {profile?.bio ??
                "منصة متكاملة لتعليم القرآن الكريم: دروس مسجلة محمية، حصص مباشرة تفاعلية، وتصحيح تلاوة صوتي فردي — من المستوى الأول حتى الإجازة بالسند."}
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3 md:justify-start">
              <Link href="/register" className={cn(buttonVariants({ size: "lg" }), "bg-amber-400 text-emerald-950 shadow-lg hover:bg-amber-300")}>
                ابدئي رحلتك الآن
              </Link>
              <a href="#levels" className={cn(buttonVariants({ size: "lg" }), "border border-amber-300/40 bg-white/10 text-amber-100 hover:bg-white/15")}>
                المستويات الثلاثة ↓
              </a>
            </div>
            {/* trust badges */}
            <div className="mt-7 flex flex-wrap justify-center gap-2 md:justify-start">
              {["مسندة إجازة", "قراءات عشر", "متابعة فردية", "نساء فقط"].map((b) => (
                <span key={b} className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-bold text-emerald-100/85 ring-1 ring-white/15">
                  ✓ {b}
                </span>
              ))}
            </div>
          </div>

          {/* Mushaf illustration */}
          <div className="relative mx-auto w-full max-w-md">
            <div className="absolute inset-0 -z-10 rounded-[2.5rem] bg-amber-300/10 blur-3xl" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mushaf.svg" alt="مصحف مفتوح" className="w-full drop-shadow-2xl" />
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-2xl border border-amber-300/30 bg-emerald-950/80 px-5 py-3 text-center backdrop-blur">
              <p className="text-[11px] font-bold text-amber-200">من الإتقان إلى السند المتصل</p>
              <p className="text-[10px] text-emerald-100/70">ثلاثة مستويات منهجية متكاملة</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── The three levels (centerpiece) ─── */}
      <section id="levels" className="mx-auto max-w-5xl px-4 py-16">
        <div className="mb-10 text-center">
          <h2 className="text-2xl font-extrabold text-emerald-950 sm:text-3xl">مسار الإتقان بالمستويات الثلاثة</h2>
          <p className="mt-2 text-sm text-emerald-800/70">لا تنتقلين لمستوى إلا بعد الإتقان التام للمستوى الذي قبله</p>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {LEVELS.map((l, i) => (
            <div key={l.n} className="group relative overflow-hidden rounded-3xl border border-emerald-800/10 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
              <div className="absolute -left-6 -top-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-4xl font-extrabold text-emerald-200 transition group-hover:text-amber-400">
                {l.n}
              </div>
              <div className="relative pt-10">
                <span className="text-3xl">{l.icon}</span>
                <h3 className="mt-3 text-lg font-extrabold text-emerald-950">{l.name}</h3>
                <p className="mt-2 text-sm leading-7 text-emerald-900/70">{l.desc}</p>
              </div>
              <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-emerald-50">
                <div className="h-full rounded-full bg-gradient-to-l from-emerald-600 to-amber-400" style={{ width: `${(i + 1) * 33.3}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Methodology ─── */}
      {profile?.methodology && (
        <section className="bg-white py-16">
          <div className="mx-auto max-w-4xl px-4">
            <div className="mb-6 text-center">
              <span className="text-amber-500 text-2xl">﴾ ﴿</span>
              <h2 className="mt-1 text-2xl font-extrabold text-emerald-950">منهجيتي في التعليم</h2>
            </div>
            <div className="whitespace-pre-line rounded-3xl border-r-4 border-amber-400 bg-emerald-50/60 p-6 text-sm leading-8 text-emerald-950/85 sm:p-8 sm:leading-9">
              {profile.methodology}
            </div>
          </div>
        </section>
      )}

      {/* ─── Features ─── */}
      <section className="bg-emerald-950 py-16 text-white">
        <div className="mx-auto max-w-5xl px-4">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-extrabold sm:text-3xl">لماذا هذه المنصة؟</h2>
            <p className="mt-2 text-sm text-emerald-100/70">كل ما تحتاجينه لتتعلّمي وتتقني من بيتك</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:bg-white/10">
                <span className="text-2xl">{f.icon}</span>
                <h3 className="mt-2 font-extrabold text-amber-200">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-7 text-emerald-100/75">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Courses ─── */}
      <section className="mx-auto max-w-5xl px-4 py-16">
        <div className="mb-10 text-center">
          <h2 className="text-2xl font-extrabold text-emerald-950 sm:text-3xl">الدورات المتاحة</h2>
          <p className="mt-2 text-sm text-emerald-800/70">سجلي في الدورة المناسبة لمستواك</p>
        </div>
        {data.courses.length === 0 ? (
          <p className="rounded-2xl bg-white p-8 text-center text-sm text-emerald-900/60 shadow-sm">لم تُنشر دورات بعد — تابعينا قريبًا</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {data.courses.map((c) => (
              <Link key={c.id} href={`/courses/${c.id}`} className="group block overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-emerald-900/10 transition hover:-translate-y-1 hover:shadow-xl">
                <div className="relative h-2" style={{ background: c.coverColor }} />
                <div className="p-6">
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-800">{c.level}</span>
                    <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-700">{c.price === 0 ? "مجانية" : `${c.price} دينار`}</span>
                    {c.hasPreview && <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold text-amber-800">✓ درس تجريبي</span>}
                  </div>
                  <h3 className="mt-3 text-lg font-extrabold text-emerald-950 group-hover:text-emerald-700">{c.title}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-emerald-900/60">{c.description}</p>
                  <p className="mt-3 text-xs font-bold text-emerald-700">{c.students} طالبة مسجلة →</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ─── Achievements ─── */}
      {achievements.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 pb-4">
          <h2 className="mb-6 text-center text-2xl font-extrabold text-emerald-950">🏅 إنجازات المعلمة</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {achievements.map((a, i) => (
              <div key={i} className="flex items-center gap-3 rounded-2xl border border-emerald-800/10 bg-white p-4 shadow-sm">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-lg">✓</span>
                <p className="text-sm font-bold text-emerald-950">{a}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─── Testimonials ─── */}
      {data.testimonials.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 py-16">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-extrabold text-emerald-950 sm:text-3xl">قول الطالبات</h2>
            <p className="mt-2 text-sm text-emerald-800/70">تجارب حقيقية من مسار الإتقان</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {data.testimonials.map((t) => (
              <figure key={t.id} className="flex flex-col rounded-3xl bg-white p-6 shadow-sm ring-1 ring-emerald-900/10">
                <div className="mb-2 text-amber-400" aria-label={`${t.rating} من 5`}>
                  {"★".repeat(t.rating)}{"☆".repeat(5 - t.rating)}
                </div>
                <blockquote className="flex-1 text-sm leading-7 text-emerald-950/85">"{t.text}"</blockquote>
                <figcaption className="mt-4 border-t border-emerald-50 pt-3">
                  <p className="text-sm font-extrabold text-emerald-950">{t.name}</p>
                  {t.level && <p className="text-[11px] font-bold text-amber-700">{t.level}</p>}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {/* ─── Final CTA ─── */}
      <section className="relative overflow-hidden bg-gradient-to-l from-emerald-900 to-emerald-950 py-16 text-center text-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: "radial-gradient(circle at 30% 30%, #f5d576 2px, transparent 2px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div className="relative mx-auto max-w-2xl px-4">
          <p className="text-2xl font-bold text-amber-300">﴿ وَرَتِّلِ الْقُرْآنَ تَرْتِيلًا ﴾</p>
          <h2 className="mt-4 text-2xl font-extrabold sm:text-3xl">ابدئي اليوم — والمقاعد محدودة لكل مستوى</h2>
          <p className="mt-3 text-sm text-emerald-100/75">سجّلي حسابك، اختاري الدورة، وابدئي أول درس تجريبي مجانًا</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/register" className={cn(buttonVariants({ size: "lg" }), "bg-amber-400 text-emerald-950 shadow-lg hover:bg-amber-300")}>
              سجّلي الآن مجانًا
            </Link>
            <Link href="/login" className={cn(buttonVariants({ size: "lg" }), "border border-amber-300/40 bg-white/10 text-amber-100 hover:bg-white/15")}>
              لدي حساب
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-emerald-900/10 bg-emerald-950 py-8 text-center text-xs text-emerald-100/50">
        <p className="text-amber-200/80">﷽</p>
        <p className="mt-2 font-bold">{profile?.displayName ?? "منصة المعلمة"} — تعليم القرآن وإتقانه للنساء</p>
        <p className="mt-1">جميع الدروس محمية بحقوق مائية مرتبطة بهوية الطالبة · صُنعت بعناية</p>
      </footer>
    </main>
  );
}
