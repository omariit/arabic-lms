"use client";

import { useEffect } from "react";

/**
 * One global safety net for expired/invalid sessions.
 *
 * Background: pages are client components that fetch JSON from `/api/...`. When a
 * session dies (cookie expired, another device logged in, AUTH_SECRET rotated, or
 * the service worker served a cached shell) those calls return 401 while the page
 * keeps rendering — which used to surface as "Application error: a client-side
 * exception" or as dashboards that silently stay empty forever.
 *
 * Patching `fetch` once here covers every current and future call site: the first
 * 401 from our own API unloads the broken page and lands on the login screen with
 * a clear message.
 */
const EXPIRED_KEY = "lms:session-expired";

export function SessionGuard() {
  useEffect(() => {
    const original = window.fetch.bind(window);
    let redirecting = false;

    const guard: typeof window.fetch = async (input, init) => {
      const res = await original(input, init);
      if (res.status !== 401 || redirecting) return res;

      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      let sameOrigin = true;
      try {
        sameOrigin = new URL(url, window.location.href).origin === window.location.origin;
      } catch {
        /* keep true */
      }
      const isApi = /\/api\//.test(url);
      if (sameOrigin && isApi && !url.includes("/api/auth/")) {
        redirecting = true;
        try {
          sessionStorage.setItem(EXPIRED_KEY, "1");
        } catch {
          /* private mode */
        }
        const next = window.location.pathname + window.location.search;
        window.location.replace(`/login?expired=1&next=${encodeURIComponent(next)}`);
      }
      return res;
    };

    window.fetch = guard;
    return () => {
      window.fetch = original;
    };
  }, []);

  return null;
}

/** True (once) when the user was bounced here by an expired session. */
export function consumeExpiredFlag(): boolean {
  try {
    if (sessionStorage.getItem(EXPIRED_KEY) !== "1") return false;
    sessionStorage.removeItem(EXPIRED_KEY);
    return true;
  } catch {
    return false;
  }
}
