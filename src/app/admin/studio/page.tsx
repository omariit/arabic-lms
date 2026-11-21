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
        <Link
          href="/admin/recordings"
          className="inline-flex h-11 items-center gap-1 rounded-xl border-2 border-brand-200 bg-white px-4 text-xs font-extrabold text-brand-900"
        >
          📼 كل التسجيلات
        </Link>
      </div>
      <p className="mb-4 text-xs text-brand-900/60">
        أضيفي ملف الدرس (PDF · صورة · Word · PowerPoint) أو شاركي شاشتك، اشرحي بالقلم والتظليل والأشكال،
        ثم سجّلي الحصة. الأدوات لا تظهر في الفيديو، ويُحوَّل التسجيل تلقائيًا إلى MP4 جاهز للعرض والتنزيل.
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
