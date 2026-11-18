import Link from "next/link";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Public landing page: teacher brand profile + course catalog + free previews. */
export default async function LandingPage() {
  const [profile, publishedCourses] = await Promise.all([
    db.teacherProfile.findFirst(),
    db.course.findMany({
      where: { published: true },
      include: {
        modules: { include: { lessons: { where: { access: "FREE_PREVIEW" } } } },
        _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const achievements = (profile?.achievements ?? "").split("\n").filter(Boolean);

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16">
      {/* Hero */}
      <section className="rounded-3xl bg-gradient-to-l from-brand-700 to-brand-500 p-8 text-white shadow-lg mt-4">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/15 text-4xl">👩‍🏫</div>
          <div>
            <h1 className="text-2xl font-extrabold sm:text-3xl">{profile?.displayName ?? "منصة المعلمة"}</h1>
            <p className="mt-1 text-white/85">{profile?.title ?? "معلمة"}</p>
          </div>
          <p className="max-w-xl text-sm leading-7 text-white/90">{profile?.bio ?? "مرحبًا بكم في منصتي التعليمية — دروس مسجلة، حصص مباشرة، واختبارات متكاملة."}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/login" className={cn(buttonVariants({ variant: "secondary", size: "lg" }))}>تسجيل الدخول</Link>
            <Link href="/register" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>حساب جديد</Link>
          </div>
          <p className="text-xs text-white/70">📲 أضف المنصة لشاشة هاتفك من قائمة المتصفح (تثبيت التطبيق)</p>
        </div>
      </section>

      {/* Teaching methodology */}
      {profile?.methodology && (
        <section className="mt-10">
          <h2 className="mb-3 text-xl font-extrabold">🎓 منهجيتي في التعليم</h2>
          <Card><CardContent className="whitespace-pre-line leading-8 text-gray-700">{profile.methodology}</CardContent></Card>
        </section>
      )}

      {/* Achievements */}
      {achievements.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-xl font-extrabold">🏅 إنجازات</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {achievements.map((a, i) => (
              <Card key={i}><CardContent className="flex items-center gap-3 py-4"><span>⭐</span><span className="text-sm font-bold">{a}</span></CardContent></Card>
            ))}
          </div>
        </section>
      )}

      {/* Course catalog */}
      <section className="mt-10">
        <h2 className="mb-3 text-xl font-extrabold">📚 الدورات</h2>
        {publishedCourses.length === 0 ? (
          <Card><CardContent className="text-center text-gray-500">لم تُنشر أي دورات بعد</CardContent></Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {publishedCourses.map((c) => (
              <Card key={c.id} className="overflow-hidden">
                <div className="h-2" style={{ background: c.coverColor }} />
                <CardHeader>
                  <CardTitle>{c.title}</CardTitle>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Badge tone="brand">{c.level}</Badge>
                    <Badge tone={c.price === 0 ? "green" : "amber"}>{c.price === 0 ? "مجانية" : `${c.price} دينار`}</Badge>
                    <Badge tone="gray">{c._count.enrollments} طالبة</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="line-clamp-2 text-sm text-gray-600">{c.description}</p>
                  {c.modules.some((m) => m.lessons.length > 0) && (
                    <p className="mt-2 text-xs font-bold text-emerald-700">✓ يوجد دروس تجريبية مجانية</p>
                  )}
                  <Link href={`/courses/${c.id}`} className={cn(buttonVariants({ size: "sm" }), "mt-4 w-full")}>
                    عرض الدورة
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <footer className="mt-14 text-center text-xs text-gray-400">
        منصة تعليمية محمية — جميع الدروس مراقبة ضد التسريب بحقوق مائية مرتبطة بهوية الطالبة
      </footer>
    </main>
  );
}
