import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Rendered when the database is unreachable (graceful degradation, never a crash page). */
export function LandingFallback() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-emerald-950 px-4 text-center text-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/mushaf.svg" alt="" className="mb-6 w-64 opacity-80" />
      <h1 className="text-2xl font-extrabold text-amber-300">منصة المعلمة لتعليم القرآن وإتقانه</h1>
      <p className="mt-3 max-w-md text-sm leading-7 text-emerald-100/70">
        معلمة قراءات وإتقان وإجازة القراءة بالمستويات الثلاثة — نسخة الموقع قيد التجهيز حاليًا.
      </p>
      <Link href="/login" className={cn(buttonVariants({ size: "lg" }), "mt-6 bg-amber-400 text-emerald-950 hover:bg-amber-300")}>
        دخول الحساب
      </Link>
    </main>
  );
}
