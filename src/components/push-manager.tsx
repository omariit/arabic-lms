"use client";

import { useEffect, useState } from "react";

/**
 * PWA notifications manager:
 * - registers the service worker
 * - asks for notification permission and subscribes to Web Push
 * - detects iOS and guides to "add to home screen" first (iOS 16.4+ requirement)
 */
export function PushManager({ label }: { label: string }) {
  const [state, setState] = useState<"idle" | "enabling" | "on" | "unsupported" | "ios-hint">("idle");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) { setState("unsupported"); return; }
    // register SW always (offline caching + install)
    navigator.serviceWorker.register("/sw.js").catch(() => {});

    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

    if (!("PushManager" in window) || !("Notification" in window)) { setState("unsupported"); return; }
    if (isIOS && !isStandalone) { setState("ios-hint"); return; }

    if (Notification.permission === "granted") {
      setState("on");
    } else {
      setState("idle");
    }
  }, []);

  const enable = async () => {
    setState("enabling");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState("idle"); return; }
      const reg = await navigator.serviceWorker.ready;
      const keyRes = await fetch("/api/push").then((r) => r.json());
      if (!keyRes.publicKey) { setState("idle"); return; }
      // resubscribe with the server key (applicationServerKey differs per install)
      const existing = await reg.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(keyRes.publicKey),
      });
      await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      setState("on");
    } catch {
      setState("idle");
    }
  };

  if (state === "unsupported") return null;

  if (state === "on") {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800">
        🔔 {label} — التنبيهات مفعّلة
      </div>
    );
  }

  if (state === "ios-hint") {
    return (
      <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-bold leading-6 text-amber-800">
        📲 لتفعيل التنبيهات على الآيفون: شاركي هذه الصفحة إلى الشاشة الرئيسية («إضافة إلى الشاشة الرئيسية» من قائمة المشاركة)، ثم افتحيها من هناك.
      </div>
    );
  }

  return (
    <button
      onClick={enable}
      disabled={state === "enabling"}
      className="mb-4 w-full rounded-2xl border border-brand-200 bg-white px-4 py-3 text-xs font-extrabold text-brand-900 transition hover:bg-brand-50 disabled:opacity-50"
    >
      {state === "enabling" ? "…" : `🔔 ${label} — تفعيل التنبيهات`}
    </button>
  );
}

function urlB64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
