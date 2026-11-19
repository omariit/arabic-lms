"use client";

import { useEffect, useState } from "react";

/**
 * Custom install button: captures the browser's beforeinstallprompt
 * and offers one-tap install ("Add to Home Screen") for the PWA.
 */
export function InstallPrompt({ label }: { label: string }) {
  const [deferred, setDeferred] = useState<Event | null>(null);
  const [installed, setInstalled] = useState(true);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (standalone || isIOS) { setInstalled(true); return; }
    setInstalled(false);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (installed || !deferred) return null;

  const install = async () => {
    const prompt = deferred as Event & { prompt?: () => Promise<void> };
    await prompt.prompt?.();
    setDeferred(null);
  };

  return (
    <button
      onClick={install}
      className="w-full rounded-2xl bg-gradient-to-l from-amber-300 to-amber-400 px-4 py-3 text-xs font-extrabold text-emerald-950 shadow-md transition hover:from-amber-200"
    >
      📲 {label} — ثبّتي التطبيق
    </button>
  );
}
