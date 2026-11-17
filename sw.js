/* Emberwell service worker — versioned cache, replace on deploy */
/* APP_VERSION marker: 2.0.5 — keep in sync with version.js (SW update check). */
importScripts("./version.js");

const VERSION = self.APP_VERSION || "2.0.5";
const CACHE = "emberwell-" + VERSION;
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=" + VERSION,
  "./game.js?v=" + VERSION,
  "./version.js?v=" + VERSION,
  "./manifest.webmanifest?v=" + VERSION,
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./fonts/bricolage-600.woff2",
  "./fonts/bricolage-700.woff2",
  "./fonts/bricolage-800.woff2",
  "./fonts/nunito-500.woff2",
  "./fonts/nunito-600.woff2",
  "./fonts/nunito-700.woff2",
  "./fonts/nunito-800.woff2",
  "./styles.css",
  "./game.js",
  "./version.js",
  "./manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        Promise.all(
          ASSETS.map((url) =>
            cache.add(url).catch(() => {
              /* optional path may 404 in some hosts */
            })
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
      .then(() =>
        self.clients.matchAll({ type: "window" }).then((clients) => {
          clients.forEach((c) => c.postMessage({ type: "SW_ACTIVATED", version: VERSION }));
        })
      )
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Network-first for navigations so deploys pick up new index + SW quickly
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Cache-first for static assets (version query busts on deploy)
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req));
    })
  );
});
