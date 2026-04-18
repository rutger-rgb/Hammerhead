/* Hammerhead HQ — service worker
 * Handles: offline caching (cache-first for static assets, network-first
 * for API/CDN), and notification click routing. */

const CACHE_NAME = "hh-cache-v6";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./orakel-splash.css",
  "./app.js",
  "./orakel-splash.js",
  "./config.js",
  "./icon.svg",
  "./manifest.webmanifest",
];

// Install: pre-cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first for same-origin static, network-first for everything else
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== "GET") return;

  // Skip Supabase, Spotify, CORS proxy, and rss2json requests (always network)
  if (
    url.hostname.includes("supabase") ||
    url.hostname.includes("spotify") ||
    url.hostname.includes("corsproxy") ||
    url.hostname.includes("allorigins") ||
    url.hostname.includes("codetabs") ||
    url.hostname.includes("rss2json") ||
    url.hostname.includes("googleapis") ||
    url.hostname.includes("gstatic")
  ) return;

  // Same-origin: network-first for HTML/JS/CSS (so updates are immediately visible),
  // cache-first for everything else (icons, manifest).
  if (url.origin === self.location.origin) {
    const isCodeFile = /\.(html|js|css)(\?.*)?$/.test(url.pathname) || url.pathname.endsWith("/");
    if (isCodeFile) {
      event.respondWith(
        fetch(event.request).then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => caches.match(event.request))
      );
    } else {
      event.respondWith(
        caches.match(event.request).then((cached) => {
          const fetchPromise = fetch(event.request).then((response) => {
            if (response && response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return response;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      );
    }
    return;
  }
});

// Notification click: focus the app and navigate to articles
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clients) {
        if ("focus" in client) {
          client.postMessage({ type: "open-articles" });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow("./#articles");
      }
    })()
  );
});
