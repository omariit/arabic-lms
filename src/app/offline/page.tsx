export const metadata = { title: "غير متصلة" };

/** Offline fallback page served by the service worker. */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[#faf8f2] px-4 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.webp" alt="مُقْرِئَة" className="mb-6 h-16 w-auto" />
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-3xl">📴</div>
      <h1 className="font-display text-xl font-extrabold text-emerald-950">لا يوجد اتصال بالإنترنت</h1>
      <p className="mt-2 max-w-sm text-sm leading-7 text-emerald-900/60">
        تحققي من الشبكة ثم أعيدي المحاولة — الصفحات التي زرتها سابقًا متاحة دون اتصال.
      </p>
    </main>
  );
}
