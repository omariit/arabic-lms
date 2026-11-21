import Link from "next/link";
import { db } from "@/lib/db";
import { requireTeacher } from "@/lib/auth";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { buttonVariants } from "@/components/ui/button";
import { cn, formatDateAr } from "@/lib/utils";
import { OneClickLauncher } from "./one-click-launcher";

/** Staff dashboard: teacher tools for TEACHER, plus user/security oversight for ADMIN. */
export default async function AdminDashboard() {
  const user = await requireTeacher();
  const isAdmin = user.role === "ADMIN";

  const [pendingRequests, voiceQueue, recentViolations, activeLives, oauth] = await Promise.all([
    db.enrollmentRequest.count({ where: { status: "PENDING" } }),
    db.examAttempt.count({ where: { status: "SUBMITTED", exam: { type: "VOICE" } } }),
    db.securityViolation.findMany({ orderBy: { createdAt: "desc" }, take: 5, include: { user: { select: { fullName: true } } } }),
    db.liveSession.findMany({ where: { status: { in: ["LIVE", "SCHEDULED"] } }, include: { course: { select: { title: true } } }, take: 5 }),
    db.teacherOAuthToken.findFirst(),
  ]);

  return (
    <main className="space-y-6">
      <h1 className="sr-only">لوحة {isAdmin ? "الإدارة" : "المعلمة"} — نظرة سريعة</h1>
      {/* One-click live launcher — the teacher's primary action */}
      <OneClickLauncher youtubeConnected={Boolean(oauth)} />

      {/* Quick stats */}
      <div className={`grid gap-3 text-center ${isAdmin ? "grid-cols-3" : "grid-cols-2"}`}>
        <Link href="/admin/enrollments"><Card className="hover:bg-brand-50"><CardContent className="py-4"><p className="text-2xl font-extrabold">{pendingRequests}</p><p className="text-xs font-bold text-gray-500">طلبات تسجيل</p></CardContent></Card></Link>
        <Link href="/admin/grading"><Card className="hover:bg-brand-50"><CardContent className="py-4"><p className="text-2xl font-extrabold">{voiceQueue}</p><p className="text-xs font-bold text-gray-500">تسجيلات للتصحيح</p></CardContent></Card></Link>
        {isAdmin && <Link href="/admin/violations"><Card className="hover:bg-brand-50"><CardContent className="py-4"><p className="text-2xl font-extrabold">{recentViolations.length}</p><p className="text-xs font-bold text-gray-500">مخالفات أمنية</p></CardContent></Card></Link>}
      </div>

      {/* Active/scheduled live sessions */}
      <section>
        <h2 className="mb-3 text-lg font-extrabold">🔴 الحصص</h2>
        {activeLives.length === 0 ? (
          <Card><CardContent className="text-sm text-gray-500">لا حصص نشطة — استخدمي زر «ابدئي الحصة المباشرة الآن»</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {activeLives.map((l) => (
              <Card key={l.id}>
                <CardContent className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-bold">{l.title}</p>
                    <p className="text-xs text-gray-400">{l.course.title} • {formatDateAr(l.scheduledAt ?? l.createdAt)}</p>
                  </div>
                  <div className="flex gap-2">
                    <Badge tone={l.status === "LIVE" ? "red" : "amber"}>{l.status === "LIVE" ? "مباشر" : "مجدول"}</Badge>
                    <Link href={`/live/${l.id}`} className={cn(buttonVariants({ size: "sm", variant: "secondary" }))}>دخول</Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Management grid — big touch-friendly buttons */}
      <section>
        <h2 className="mb-3 text-lg font-extrabold">⚙️ الإدارة</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { href: "/admin/courses", label: "الدورات والدروس", icon: "📚" },
            { href: "/admin/exams", label: "الاختبارات", icon: "📝" },
            { href: "/admin/testimonials", label: "آراء الطالبات", icon: "💬" },
            { href: "/admin/vouchers", label: "الكوبونات", icon: "🎟️" },
            { href: "/admin/students", label: "المستخدمات والأجهزة", icon: "👩‍🎓", adminOnly: true },
            { href: "/admin/profile", label: "ملفي ويوتيوب", icon: "⚙️" },
            { href: "/admin/violations", label: "سجل الحماية", icon: "🛡️", adminOnly: true },
          ].filter((a) => !a.adminOnly || isAdmin).map((a) => (
            <Link key={a.href} href={a.href} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "flex-col gap-1 h-auto py-5")}>
              <span className="text-2xl">{a.icon}</span>
              <span>{a.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Recent security activity */}
      {recentViolations.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-extrabold">🛡️ آخر المخالفات</h2>
          <Card>
            <CardContent className="divide-y divide-brand-50">
              {recentViolations.map((v) => (
                <div key={v.id} className="flex items-center justify-between py-3 text-sm">
                  <span>{v.user?.fullName ?? "غير معروف"}</span>
                  <Badge tone="red">{v.type}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}
    </main>
  );
}
