"use client";

import { useEffect } from "react";

/**
 * Friendly recovery screen instead of Next's raw
 * "Application error: a client-side exception has occurred".
 * Offers a real reload (which also refreshes a stale auth cookie).
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("UI error:", error);
  }, [error]);

  return (
    <main
      dir="rtl"
      className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-6 py-16 text-center"
    >
      <div className="text-5xl">🌙</div>
      <h1 className="text-xl font-extrabold">صار خلل مؤقت في هذه الصفحة</h1>
      <p className="max-w-md text-sm text-gray-600">
        يمكنك إعادة المحاولة الآن. إذا تكرّر الأمر فغالبًا انتهت جلستك — سجّلي الدخول من جديد وستعود كل
        بياناتك كما هي.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={reset}
          className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
        >
          إعادة المحاولة
        </button>
        <a
          href="/dashboard"
          className="rounded-xl border border-brand-200 px-5 py-2.5 text-sm font-bold text-brand-700 hover:bg-brand-50"
        >
          لوحتي
        </a>
        <a
          href="/login"
          className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50"
        >
          تسجيل الدخول
        </a>
      </div>
      {error.digest && <p className="text-[11px] text-gray-400" dir="ltr">ref: {error.digest}</p>}
    </main>
  );
}
