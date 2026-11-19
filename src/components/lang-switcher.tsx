"use client";

import { useTransition } from "react";

/** Tiny language switcher: sets the `lang` cookie and reloads so all server components re-render. */
export function LangSwitcher({ current, dir: _ignored }: { current: "ar" | "en"; dir?: never }) {
  const [pending, start] = useTransition();
  const other = current === "ar" ? "en" : "ar";
  const label = current === "ar" ? "English" : "العربية";

  const switchLang = () => {
    start(() => {
      document.cookie = `lang=${other}; path=/; max-age=${60 * 60 * 24 * 365}`;
      window.location.reload();
    });
  };

  return (
    <button
      onClick={switchLang}
      disabled={pending}
      className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-bold text-amber-200 transition hover:bg-white/10"
      aria-label={current === "ar" ? "Switch to English" : "التبديل إلى العربية"}
    >
      {pending ? "…" : label}
    </button>
  );
}
