import Link from "next/link";
import { db } from "@/lib/db";
import { requireStudent } from "@/lib/auth";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { buttonVariants } from "@/components/ui/button";
import { cn, formatDateAr } from "@/lib/utils";
import { VoucherRedeem } from "./voucher-redeem";
import { LogoutButton } from "@/components/logout-button";

/** Student dashboard: enrollments, upcoming live classes, pending exams, voucher redeem. */
export default async function StudentDashboard() {
  const user = await requireStudent();

  const [enrollments, liveSessions, attempts] = await Promise.all([
    db.enrollment.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      include: {
        course: {
          include: {
            exams: { where: { published: true }, select: { id: true, title: true, type: true } },
            liveSessions: { where: { status: { in: ["LIVE", "SCHEDULED"] } }, orderBy: { scheduledAt: "desc" }, take: 3 },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.liveSession.findMany({
      where: { status: "LIVE", course: { enrollments: { some: { userId: user.id, status: "ACTIVE" } } } },
      include: { course: { select: { title: true } } },
      take: 3,
    }),
    db.examAttempt.findMany({
      where: { userId: user.id, status: { in: ["SUBMITTED", "GRADED"] } },
      include: { exam: { select: { title: true, maxGrade: true } } },
      orderBy: { submittedAt: "desc" },
      take: 5,
    }),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 pb-20 pt-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">مرحبًا {user.fullName} 👋</h1>
          <p className="text-sm text-gray-500">لوحة الطالبة</p>
        </div>
        <LogoutButton />
      </header>

      {/* Live now */}
      {liveSessions.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-extrabold text-red-700">🔴 حصص مباشرة الآن</h2>
          <div className="space-y-3">
            {liveSessions.map((l) => (
              <Card key={l.id} className="border-red-200">
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="font-bold">{l.title}</p>
                    <p className="text-xs text-gray-500">{l.course.title}</p>
                  </div>
                  <Link href={`/live/${l.id}`} className={cn(buttonVariants({ variant: "destructive" }))}>انضمي الآن</Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* My courses */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-extrabold">📚 دوراتي</h2>
        {enrollments.length === 0 ? (
          <Card><CardContent className="text-center text-gray-500">
            لا توجد دورات بعد — تصفّحي <Link href="/" className="font-bold text-brand-600 underline">الدورات المتاحة</Link>
          </CardContent></Card>
        ) : (
          <div className="space-y-3">
            {enrollments.map((e) => (
              <Card key={e.id}>
                <CardHeader>
                  <CardTitle>{e.course.title}</CardTitle>
                  <div className="flex gap-2">
                    <Badge tone="brand">{e.course.level}</Badge>
                    {e.course.liveSessions.some((l) => l.status === "LIVE") && <Badge tone="red">مباشر الآن</Badge>}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/courses/${e.course.id}`} className={cn(buttonVariants({ size: "sm" }))}>الدروس</Link>
                    {e.course.exams.map((ex) => (
                      <Link key={ex.id} href={`/exam/${ex.id}`} className={cn(buttonVariants({ size: "sm", variant: "secondary" }))}>
                        {ex.type === "VOICE" ? "🎤" : "📝"} {ex.title}
                      </Link>
                    ))}
                  </div>
                  {e.course.liveSessions.filter((l) => l.status === "SCHEDULED").map((l) => (
                    <p key={l.id} className="mt-2 text-xs text-gray-500">⏰ حصة مجدولة: {formatDateAr(l.scheduledAt ?? new Date())}</p>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Recent results */}
      {attempts.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-extrabold">📊 آخر النتائج</h2>
          <Card>
            <CardContent className="divide-y divide-brand-50">
              {attempts.map((a) => (
                <div key={a.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-bold">{a.exam.title}</p>
                    <p className="text-xs text-gray-400">{formatDateAr(a.submittedAt ?? a.startedAt)}</p>
                  </div>
                  <Badge tone={a.status === "GRADED" ? "green" : "amber"}>
                    {a.status === "GRADED" ? `${a.manualGrade ?? a.autoScore ?? 0} / ${a.exam.maxGrade}` : "بانتظار التصحيح"}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}

      {/* Voucher redeem */}
      <section>
        <h2 className="mb-3 text-lg font-extrabold">🎟️ تفعيل كوبون</h2>
        <VoucherRedeem />
      </section>
    </main>
  );
}
