/* Dukaan Manager service worker.
 * - App files (/_next/static, icons, fonts) are cached so the app opens fast and installs as an app.
 * - Pages load from the network. The billing page (/pos) is also saved after each visit so it can
 *   open when the server is unreachable (offline billing). Other pages show an offline notice.
 * - API data is never cached here; the POS keeps its own copy of products for offline billing.
 */
const STATIC = "dukaan-static-v2";
const PAGES = "dukaan-pages-v2";
const OFFLINE_URL = "/offline";
const OFFLINE_PAGES = ["/pos"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC).then((cache) => cache.addAll([OFFLINE_URL, "/icons/icon-192.png"])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC && k !== PAGES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function cacheFirst(req) {
  return caches.match(req).then(
    (hit) =>
      hit ||
      fetch(req).then((res) => {
        if (res.ok || res.type === "opaque") {
          const copy = res.clone();
          caches.open(STATIC).then((cache) => cache.put(req, copy));
        }
        return res;
      }),
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(cacheFirst(req));
    return;
  }
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    const savable = OFFLINE_PAGES.includes(url.pathname);
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (savable && res.ok && !res.redirected) {
            const copy = res.clone();
            caches.open(PAGES).then((cache) => cache.put(url.pathname, copy));
          }
          return res;
        })
        .catch(async () => (savable && (await caches.match(url.pathname, { cacheName: PAGES }))) || caches.match(OFFLINE_URL)),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(req));
  }
});
