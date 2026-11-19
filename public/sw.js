/**
 * مُقْرِئَة — Service Worker
 * 1) Offline caching: app shell precached, static assets cache-first, pages network-first.
 * 2) Web Push: live-class alerts, chat messages, exam grading.
 * 3) Notification click: focus an open window or open the target URL.
 */
const VERSION = "muqriah-v3";
const APP_SHELL = [
  "/",
  "/login",
  "/register",
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

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // never cache API, sockets, or cross-origin
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/socket.io")) return;

  // static build assets: cache-first (immutable)
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icon") || /\.(png|svg|jpg|jpeg|webp|woff2)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(request, copy));
        return res;
      }))
    );
    return;
  }

  // pages & everything else: network-first with offline fallback
  event.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(request, copy));
        return res;
      })
      .catch(() =>
        caches.match(request).then((hit) => hit || caches.match("/offline"))
      )
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
