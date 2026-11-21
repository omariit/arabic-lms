import { requireTeacher } from "@/lib/auth";
import { LiveReport } from "./live-report";

export const dynamic = "force-dynamic";

export const metadata = { title: "تقرير الحصة", robots: { index: false, follow: false } };

export default async function LiveReportPage({ params }: { params: Promise<{ id: string }> }) {
  await requireTeacher();
  const { id } = await params;
  return (
    <main className="mx-auto max-w-4xl p-3 pb-24 sm:p-4">
      <LiveReport liveId={id} />
    </main>
  );
}
