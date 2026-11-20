// CounTrack service worker: keeps the capture flow usable offline.
// Bump VERSION on every deploy that changes the app shell.
const VERSION = "v7";
const CACHE = `countrack-${VERSION}`;
const PAGES = ["/capture", "/", "/queue", "/incidents"];
const SHELL = [...PAGES, "/manifest.webmanifest", "/icons/icon-192.png"];
// On a weak mobile signal a request can hang for a long time: give the network this long,
// then answer from the saved copy so the app still opens.
const NETWORK_TIMEOUT_MS = 4000;
// Next.js sends "Vary: rsc, next-router-state-tree, …, Accept-Encoding" on every page. Safari applies
// Vary strictly when matching the Cache API, so a saved page never matched an offline navigation
// and Safari showed "can't open the page". Saved entries are whole HTML pages and hashed static
// files, so the URL alone identifies them.
const MATCH = { ignoreVary: true };

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // One slow or failing page must not stop the rest being saved (addAll is all-or-nothing).
      await Promise.allSettled(SHELL.map((p) => cache.add(new Request(p, { cache: "reload" }))));
      // Also cache the JS/CSS those pages reference, so they work offline even if never opened.
      const assets = new Set();
      for (const path of PAGES) {
        const res = await cache.match(path, MATCH);
        if (!res) continue;
        for (const m of (await res.text()).matchAll(/\/_next\/static\/[^"'\s)\\]+/g)) assets.add(m[0]);
      }
      await Promise.allSettled([...assets].map((a) => cache.add(a)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(req));
  } else if (req.mode === "navigate") {
    event.respondWith(networkFirst(req));
  }
});

async function cacheFirst(req) {
  const hit = await caches.match(req, MATCH);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const network = fetch(req).then(async (res) => {
    if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
    return res;
  });
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS));
  try {
    const res = await Promise.race([network, timeout]);
    if (res) return res;
  } catch {
    /* offline: fall through to the saved copy */
  }
  const saved = (await caches.match(req, { ...MATCH, ignoreSearch: true })) ?? (await caches.match("/capture", MATCH));
  // Still nothing saved: keep waiting for the slow network rather than failing outright.
  return saved ?? network.catch(() => Response.error());
}
