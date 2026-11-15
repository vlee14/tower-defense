/* Runway Defense service worker — versioned cache-first offline shell */
/* APP_VERSION marker: 1.0.0 — must change when version.js bumps (update check). */
importScripts("./version.js");

const VERSION = self.APP_VERSION || "1.0.0";
const CACHE = "runway-defense-" + VERSION;

function withVersion(path) {
  const join = path.indexOf("?") >= 0 ? "&" : "?";
  return path + join + "v=" + encodeURIComponent(VERSION);
}

const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./game.js",
  "./version.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
].map(withVersion);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
      .then(() =>
        self.clients.matchAll({ type: "window" }).then((clients) => {
          clients.forEach((client) => {
            client.postMessage({ type: "SW_ACTIVATED", version: VERSION });
          });
        })
      )
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") self.skipWaiting();
  if (data.type === "GET_VERSION" && event.source) {
    event.source.postMessage({ type: "SW_VERSION", version: VERSION });
  }
});

function isHtmlRequest(request) {
  if (request.mode === "navigate") return true;
  const accept = request.headers.get("accept") || "";
  return accept.includes("text/html");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Let the browser fetch sw.js uncached so updates can install.
  if (url.pathname.endsWith("/sw.js")) return;

  // Navigations / HTML: network-first so a deploy is picked up while online.
  if (isHtmlRequest(request)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => {
              cache.put(withVersion("./index.html"), copy);
            });
          }
          return response;
        })
        .catch(() =>
          caches
            .match(withVersion("./index.html"))
            .then((cached) => cached || caches.match("./index.html"))
        )
    );
    return;
  }

  // Everything else: cache-first, then network and store.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(withVersion("./index.html")));
    })
  );
});
