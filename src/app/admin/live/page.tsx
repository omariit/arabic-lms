import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { OneClickLauncher } from "../one-click-launcher";
import { Badge, Card, CardContent } from "@/components/ui/primitives";
import { buttonVariants } from "@/components/ui/button";
import { cn, formatDateAr } from "@/lib/utils";

/** Standalone live launcher page. */
export default async function AdminLivePage() {
  await requireAdmin();
  const [oauth, lives] = await Promise.all([
    db.teacherOAuthToken.findFirst(),
    db.liveSession.findMany({
      orderBy: { createdAt: "desc" }, take: 10,
      include: { course: { select: { title: true } }, attendanceLogs: { select: { id: true } } },
    }),
  ]);

  return (
    <main className="space-y-6">
      <OneClickLauncher youtubeConnected={Boolean(oauth)} />

      <section>
        <h2 className="mb-3 text-lg font-extrabold">📋 سجل الحصص</h2>
        <div className="space-y-2">
          {lives.map((l) => (
            <Card key={l.id}>
              <CardContent className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-bold">{l.title}</p>
                  <p className="text-xs text-gray-400">{l.course.title} • {formatDateAr(l.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={l.status === "LIVE" ? "red" : l.status === "ENDED" ? "gray" : "amber"}>
                    {l.status === "LIVE" ? "مباشر" : l.status === "ENDED" ? "منتهية" : "مجدولة"}
                  </Badge>
                  <Badge tone="brand">{l.attendanceLogs.length} حاضرة</Badge>
                  <Link href={`/live/${l.id}`} className={cn(buttonVariants({ size: "sm", variant: "secondary" }))}>دخول</Link>
                </div>
              </CardContent>
            </Card>
          ))}
          {lives.length === 0 && <Card><CardContent className="text-center text-gray-500">لا حصص بعد</CardContent></Card>}
        </div>
      </section>
    </main>
  );
}
