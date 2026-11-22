import Link from "next/link";

/** Friendly 404 with the platform identity. */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[#faf8f2] px-4 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.webp" alt="مُقْرِئَة" className="mb-6 h-20 w-auto" />
      <p className="font-display text-5xl font-extrabold text-emerald-800 sm:text-6xl">٤٠٤</p>
      <h1 className="mt-3 font-display text-xl font-extrabold text-emerald-950 sm:text-2xl">
        الصفحة غير موجودة
      </h1>
      <p className="mt-2 max-w-sm text-sm leading-7 text-emerald-900/60">
        يبدو أنك وصلتِ إلى رابط غير صحيح — ربما خطأ في الكتابة أو الصفحة انتقلت.
      </p>
      <div className="mt-6 flex gap-3">
        <Link
          href="/"
          className="rounded-xl bg-emerald-800 px-5 py-2.5 text-sm font-extrabold text-white shadow transition hover:bg-emerald-700"
        >
          الصفحة الرئيسية
        </Link>
        <Link
          href="/login"
          className="rounded-xl border border-emerald-800/25 bg-white px-5 py-2.5 text-sm font-bold text-emerald-900 transition hover:bg-emerald-50"
        >
          تسجيل الدخول
        </Link>
      </div>
    </main>
  );
}
