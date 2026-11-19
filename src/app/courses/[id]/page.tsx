import Link from "next/link";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { viewerCountry, currencyFor } from "@/lib/pricing";
import { countryName } from "@/lib/phone";
import { getLocale, waLink } from "@/lib/i18n";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { buttonVariants } from "@/components/ui/button";
import { cn, formatSeconds } from "@/lib/utils";
import { EnrollActions } from "./enroll-actions";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://arabic-lms-production.up.railway.app";

/** SEO metadata per course (title, description, OpenGraph). */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try {
    const course = await db.course.findUnique({
      where: { id },
      select: { title: true, description: true, level: true, published: true },
    });
    if (!course || !course.published) return { robots: { index: false } };
    const suffix = course.title.includes(course.level) ? "" : ` — ${course.level}`;
    return {
      title: `${course.title}${suffix}`,
      description: course.description.slice(0, 160),
      alternates: { canonical: `/courses/${id}` },
      openGraph: {
        title: `${course.title} | مُقْرِئَة`,
        description: course.description.slice(0, 160),
        url: `${BASE_URL}/courses/${id}`,
        images: ["/og.png"],
        type: "website",
      },
    };
  } catch {
    return { robots: { index: false } };
  }
}

/** Course detail: country-aware monthly price, curriculum, and paid-enrollment flow. */
export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = await getLocale();
  const ar = locale === "ar";
  const user = await getCurrentUser();
  const h = await headers();
  const viewer = viewerCountry({
    headerCountry: h.get("cf-ipcountry") ?? h.get("x-country"),
    userCountry: user?.countryCode ?? null,
  });

  const course = await db.course.findUnique({
    where: { id },
    include: {
      modules: { orderBy: { position: "asc" }, include: { lessons: { orderBy: { position: "asc" } } } },
      exams: { select: { id: true, title: true, type: true }, where: { published: true } },
      prices: true,
      _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
    },
  });
  if (!course) {
    return <main className="mx-auto max-w-3xl px-4 py-16 text-center">{ar ? "الدورة غير موجودة" : "Course not found"}</main>;
  }

  // Monthly price: country override → default (JOD).
  const override = course.prices.find((p) => p.countryCode === viewer && p.price !== course.price);
  const price = override ? override.price : course.price;
  const currency = override ? currencyFor(viewer) : ar ? "دينار" : "JOD";
  const priceLabel = price === 0
    ? (ar ? "مجانية" : "Free")
    : currency === "$" ? `$${price}` : `${price} ${currency}`;
  const monthly = ar ? "/ شهريًا" : "/ month";

  const enrollment = user
    ? await db.enrollment.findFirst({ where: { userId: user.id, courseId: course.id, status: "ACTIVE" } })
    : null;
  const pendingRequest = user
    ? await db.enrollmentRequest.findFirst({ where: { userId: user.id, courseId: course.id, status: "PENDING" } })
    : null;
  const teacherProfile = await db.teacherProfile.findFirst();
  const isEnrolled = Boolean(enrollment);
  const canWatch = (access: string) => access === "FREE_PREVIEW" || (user && isEnrolled);

  const wa = teacherProfile?.whatsappNumber?.replace(/\D/g, "");
  const waMsg = ar
    ? `مرحبًا، أنا ${user?.fullName ?? "طالبة جديدة"} — أرغب بالالتحق بدورة «${course.title}» (السعر: ${priceLabel}${price > 0 ? " " + monthly : ""}). ما هي بيانات التحويل المالية؟`
    : `Hello, I'm ${user?.fullName ?? "a new student"} — I'd like to join "${course.title}" (price: ${priceLabel}${price > 0 ? " " + monthly : ""}). Could you share the payment details?`;
  const waHref = wa ? waLink(wa, waMsg) : null;

  return (
    <main className="mx-auto max-w-3xl px-4 pb-20 pt-6">
      <div className="rounded-3xl p-6 text-white shadow" style={{ background: course.coverColor }}>
        <h1 className="text-2xl font-extrabold">{course.title}</h1>
        <p className="mt-2 text-sm leading-7 text-white/90">{course.description}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-white/20 px-3 py-1 font-bold">{course.level}</span>
          <span className="rounded-full bg-amber-300/90 px-3 py-1 font-extrabold text-emerald-950">
            {price === 0 ? priceLabel : `${priceLabel} ${monthly}`}
          </span>
          <span className="rounded-full bg-white/20 px-3 py-1 font-bold">{course._count.enrollments} {ar ? "طالبة" : "students"}</span>
          {course.weeklyMeetings && (
            <span className="rounded-full bg-white/15 px-3 py-1 font-bold">🗓 {ar ? "لقاءات أسبوعية" : "weekly live meetings"}</span>
          )}
          {override && (
            <span className="rounded-full bg-white/20 px-3 py-1 font-bold">
              🌍 {countryName(viewer, locale)}
            </span>
          )}
        </div>
      </div>

      {!isEnrolled && (
        <div className="mt-4">
          {user ? (
            <EnrollActions courseId={course.id} price={price} currency={currency} monthly={monthly}
              viewerCountry={viewer} pendingRequest={Boolean(pendingRequest)}
              cliqAlias={teacherProfile?.cliqAlias} bankHint={teacherProfile?.bankHint}
              waHref={waHref} />
          ) : (
            <Card className="border-emerald-200">
              <CardContent className="py-4 text-center">
                <Link href="/login" className={cn(buttonVariants({ size: "lg" }), "w-full")}>
                  {ar ? "سجّلي الدخول للانضمام" : "Log in to join"}
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-extrabold">{ar ? "📖 محتوى الدورة" : "📖 Curriculum"}</h2>
        {course.weeklyMeetings && (
          <div className="mb-4 rounded-3xl border-2 border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-extrabold text-emerald-900">🗓 {ar ? "جدول اللقاءات الأسبوعية المباشرة" : "Weekly live meetings schedule"}</p>
            <p className="mt-1 whitespace-pre-line text-sm leading-7 text-emerald-900/75">{course.weeklyMeetings}</p>
          </div>
        )}
        {course.modules.length === 0 && (
          <Card><CardContent className="text-center text-gray-500">{ar ? "لم تُضف دروس بعد" : "No lessons yet"}</CardContent></Card>
        )}
        <div className="space-y-4">
          {course.modules.map((m) => (
            <Card key={m.id}>
              <CardHeader><CardTitle>{m.title}</CardTitle></CardHeader>
              <CardContent className="divide-y divide-emerald-50">
                {m.lessons.length === 0 && <p className="py-2 text-sm text-gray-400">{ar ? "لا دروس في هذه الوحدة" : "No lessons in this module"}</p>}
                {m.lessons.map((l) => (
                  <div key={l.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{canWatch(l.access) ? "▶️" : l.access === "FREE_PREVIEW" ? "🔓" : "🔒"}</span>
                      <div>
                        <p className="text-sm font-bold">{l.title}</p>
                        <p className="text-xs text-gray-400">{l.duration > 0 ? formatSeconds(l.duration) : ""}</p>
                      </div>
                    </div>
                    {canWatch(l.access) ? (
                      <Link href={`/lesson/${l.id}`} className={cn(buttonVariants({ size: "sm" }))}>{ar ? "مشاهدة" : "Watch"}</Link>
                    ) : l.access === "FREE_PREVIEW" ? (
                      <Link href={`/lesson/${l.id}`} className={cn(buttonVariants({ size: "sm", variant: "secondary" }))}>{ar ? "تجريبي" : "Trial"}</Link>
                    ) : (
                      <Badge tone="gray">{ar ? "للمسجلات" : "Enrolled"}</Badge>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {course.exams.length > 0 && isEnrolled && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-extrabold">{ar ? "📝 الاختبارات" : "📝 Exams"}</h2>
          <div className="flex flex-wrap gap-2">
            {course.exams.map((e) => (
              <Link key={e.id} href={`/exam/${e.id}`} className={cn(buttonVariants({ size: "sm", variant: "secondary" }))}>
                {e.type === "VOICE" ? "🎤" : "📝"} {e.title}
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="mt-10 text-center">
        <Link href="/dashboard" className="text-sm font-bold text-emerald-700 underline">
          {ar ? "→ لوحة الطالبة" : "→ Student dashboard"}
        </Link>
      </div>
    </main>
  );
}
