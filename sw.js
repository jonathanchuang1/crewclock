/**
 * CrewClock service worker.
 *
 * Strategy:
 *  - Precache the app shell so the PWA opens instantly and works offline.
 *  - Network-first for navigations (fall back to cached shell when offline).
 *  - NEVER cache Google Forms submissions or the published CSV reads — those
 *    must always hit the network. The app's own offline queue handles writes.
 */
const CACHE = "crewclock-v1";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Bypass cache entirely for Google endpoints (writes + config reads).
  if (
    url.hostname.includes("docs.google.com") ||
    url.hostname.includes("google.com")
  ) {
    return; // default: go to network
  }

  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Cache-first for same-origin static assets.
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then(
        (cached) =>
          cached ||
          fetch(e.request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
            return res;
          })
      )
    );
  }
});
