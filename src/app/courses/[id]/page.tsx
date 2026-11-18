import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { buttonVariants } from "@/components/ui/button";
import { cn, formatSeconds } from "@/lib/utils";
import { EnrollActions } from "./enroll-actions";

/** Course detail: curriculum with free-preview lessons + enrollment actions. */
export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const course = await db.course.findUnique({
    where: { id },
    include: {
      modules: { orderBy: { position: "asc" }, include: { lessons: { orderBy: { position: "asc" } } } },
      exams: { select: { id: true, title: true, type: true }, where: { published: true } },
      _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
    },
  });
  if (!course) {
    return <main className="mx-auto max-w-3xl px-4 py-16 text-center">الدورة غير موجودة</main>;
  }

  const enrollment = user
    ? await db.enrollment.findFirst({ where: { userId: user.id, courseId: course.id, status: "ACTIVE" } })
    : null;
  const pendingRequest = user
    ? await db.enrollmentRequest.findFirst({ where: { userId: user.id, courseId: course.id, status: "PENDING" } })
    : null;
  const teacherProfile = await db.teacherProfile.findFirst();
  const isEnrolled = Boolean(enrollment);
  const canWatch = (access: string) => access === "FREE_PREVIEW" || (user && isEnrolled);

  return (
    <main className="mx-auto max-w-3xl px-4 pb-20 pt-6">
      <div className="rounded-3xl p-6 text-white shadow" style={{ background: course.coverColor }}>
        <h1 className="text-2xl font-extrabold">{course.title}</h1>
        <p className="mt-2 text-sm leading-7 text-white/90">{course.description}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-white/20 px-3 py-1 font-bold">{course.level}</span>
          <span className="rounded-full bg-white/20 px-3 py-1 font-bold">{course.price === 0 ? "مجانية" : `${course.price} دينار`}</span>
          <span className="rounded-full bg-white/20 px-3 py-1 font-bold">{course._count.enrollments} طالبة</span>
        </div>
      </div>

      {!isEnrolled && (
        <div className="mt-4">
          {user ? (
            <EnrollActions courseId={course.id} price={course.price} pendingRequest={Boolean(pendingRequest)}
              cliqAlias={teacherProfile?.cliqAlias} bankHint={teacherProfile?.bankHint} />
          ) : (
            <Card className="border-brand-200">
              <CardContent className="py-4 text-center">
                <Link href="/login" className={cn(buttonVariants({ size: "lg" }), "w-full")}>سجّلي الدخول للانضمام</Link>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-extrabold">📖 محتوى الدورة</h2>
        {course.modules.length === 0 && (
          <Card><CardContent className="text-center text-gray-500">لم تُضف دروس بعد</CardContent></Card>
        )}
        <div className="space-y-4">
          {course.modules.map((m) => (
            <Card key={m.id}>
              <CardHeader><CardTitle>{m.title}</CardTitle></CardHeader>
              <CardContent className="divide-y divide-brand-50">
                {m.lessons.length === 0 && <p className="py-2 text-sm text-gray-400">لا دروس في هذا الوحدة</p>}
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
                      <Link href={`/lesson/${l.id}`} className={cn(buttonVariants({ size: "sm" }))}>مشاهدة</Link>
                    ) : l.access === "FREE_PREVIEW" ? (
                      <Link href={`/lesson/${l.id}`} className={cn(buttonVariants({ size: "sm", variant: "secondary" }))}>تجريبي</Link>
                    ) : (
                      <Badge tone="gray">للمسجلات</Badge>
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
          <h2 className="mb-3 text-lg font-extrabold">📝 الاختبارات</h2>
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
        <Link href="/dashboard" className="text-sm font-bold text-brand-600 underline">→ لوحة الطالبة</Link>
      </div>
    </main>
  );
}
