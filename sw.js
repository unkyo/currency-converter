/* Offline-first service worker for GitHub Pages (static site). */

const CACHE_NAME = "fx-cache-v1";

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./privacy.html",
  "./partners.html",
  "./support.html",
  "./rates/",
  "./rates/index.html",
  "./rates/usd-rub.html",
  "./rates/eur-rub.html",
  "./rates/gbp-rub.html",
  "./rates/gel-rub.html",
  "./rates/kzt-rub.html",
  "./404.html",
  "./favicon.svg",
  "./favicon-16.png",
  "./favicon-32.png",
  "./apple-touch-icon.png",
  "./og.png",
  "./site.webmanifest",
  "./robots.txt",
  "./sitemap.xml",
  "./data/history-usd.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(PRECACHE_URLS);
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

function isNavigation(request) {
  return request.mode === "navigate" || (request.headers.get("accept") || "").includes("text/html");
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  const cache = await caches.open(CACHE_NAME);
  cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const fetchPromise = fetch(request)
    .then(async (res) => {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);

  return cached || (await fetchPromise) || new Response("Offline", { status: 503 });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Navigations: try network first, fall back to cached shell.
  if (isNavigation(request)) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, res.clone());
          return res;
        } catch {
          return (await caches.match("./index.html")) || (await caches.match("./")) || new Response("Offline", { status: 503 });
        }
      })()
    );
    return;
  }

  // Same-origin static assets: cache-first.
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Exchange rates API: SWR (offline-friendly).
  if (url.hostname === "open.er-api.com") {
    event.respondWith(staleWhileRevalidate(request));
  }
});
