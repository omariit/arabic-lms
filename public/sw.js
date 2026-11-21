/**
 * مُقْرِئَة — Service Worker
 * 1) Offline caching: app shell precached, static assets cache-first, pages network-first.
 * 2) Web Push: live-class alerts, chat messages, exam grading.
 * 3) Notification click: focus an open window or open the target URL.
 */
const VERSION = "muqriah-v6";
const APP_SHELL = [
  "/",
  "/offline",
  "/logo.png",
  "/logo-square.png",
  "/icon.svg",
  "/mushaf.svg",
  "/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const PRIVATE_PREFIXES = ["/admin", "/dashboard", "/lesson", "/exam", "/live", "/api"];
// Auth pages must always be fresh: a cached login form kept serving an old bundle
// after a deploy, which made signing in fail with no visible reason.
const NETWORK_ONLY = ["/login", "/register", "/offline"];

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // never touch API, sockets, or cross-origin requests
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/socket.io")) return;

  // Personal pages must never come from the cache: a stale shell showing a
  // logged-in dashboard after the session ended is worse than a slow load.
  if (
    PRIVATE_PREFIXES.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`)) ||
    NETWORK_ONLY.includes(url.pathname)
  ) {
    event.respondWith(fetch(request).catch(() => caches.match("/offline")));
    return;
  }

  // static build assets: cache-first (immutable)
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icon") || /\.(png|svg|jpg|jpeg|webp|woff2)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        // Redirected/ opaque responses cannot be stored — caching them threw.
        if (res.ok && res.type === "basic" && !res.redirected) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(request, copy)).catch(() => {});
        }
        return res;
      }))
    );
    return;
  }

  // public pages: network-first with offline fallback
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok && res.type === "basic" && !res.redirected) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match("/offline")))
  );
});

/* ─── Web Push ─── */

self.addEventListener("push", (event) => {
  let data = { title: "مُقْرِئَة", body: "لديك تحديث جديد", url: "/dashboard" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/logo-square.png",
      badge: "/icon.svg",
      tag: data.tag || "muqriah",
      renotify: true,
      dir: "rtl",
      lang: "ar",
      vibrate: [80, 40, 80],
      data: { url: data.url || "/dashboard" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
