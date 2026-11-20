import Link from "next/link";
import { requireTeacher } from "@/lib/auth";
import { recordingConfigured } from "@/lib/recording";
import { Studio } from "./studio";

export const metadata = { robots: { index: false, follow: false } };

/** Teacher Recording Page (Teaching Studio): screen/camera + mic → chunked upload → MP4. */
export default async function StudioPage() {
  const user = await requireTeacher();

  return (
    <main className="mx-auto max-w-3xl px-4 pb-20 pt-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-extrabold text-amber-600">استوديو التعليم</p>
          <h1 className="text-lg font-extrabold text-brand-950">🎬 تسجيل حصة</h1>
        </div>
        <Link href="/admin/recordings" className="rounded-xl border border-brand-200 px-3 py-2 text-xs font-bold text-brand-900">
          📼 كل التسجيلات
        </Link>
      </div>
      <p className="mb-4 text-xs text-brand-900/60">
        اختاري الدرس، شاركي الشاشة أو الكاميرا، وسجّلي الحصة. يُرفع الفيديو أثناء التسجيل ويُحوَّل تلقائيًا إلى MP4
        جاهز للعرض والتنزيل — يمكنك إغلاق الصفحة بعد الحفظ.
      </p>
      <Studio
        canUseService={recordingConfigured()}
        serviceUrl={process.env.RECORDING_SERVICE_URL ?? ""}
      />
      <p className="mt-4 text-center text-[11px] text-gray-400">
        مسجّلة باسم {user.fullName} — كل تسجيل مرتبط بحسابك.
      </p>
    </main>
  );
}
