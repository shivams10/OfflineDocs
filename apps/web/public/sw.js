/* DocSync service worker.

   A static file, deliberately outside the Next build: no bundling, no
   TypeScript, no env substitution. Its config arrives as a query string at
   registration time. */

/// <reference lib="webworker" />

/** Build stamp. Changing it changes every cache name, retiring the old ones. */
const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";

const SHELL_CACHE = `docsync-shell-${VERSION}`;
const STATIC_CACHE = `docsync-static-${VERSION}`;

/* Stable URLs only. Hashed bundles cannot be listed here — their names change
   every build — so they are cached at runtime instead. */
const PRECACHE_URLS = [
  "/dashboard",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  /* No skipWaiting(): a new worker taking over under a user mid-edit would swap
     the code out from under them. It waits until every tab using the old one
     has closed. */
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      /* Individually, not addAll(): addAll is atomic, so a single 404 would fail
         the whole install and leave the app with no worker at all. */
      Promise.all(
        PRECACHE_URLS.map((url) =>
          // `cache: "reload"` so a stale HTTP-cached copy is never what we store.
          cache
            .add(new Request(url, { cache: "reload" }))
            .catch((error) => console.warn("[sw] could not precache", url, error)),
        ),
      ),
    ),
  );
});

self.addEventListener("activate", (event) => {
  const keep = new Set([SHELL_CACHE, STATIC_CACHE]);

  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith("docsync-") && !keep.has(name))
          await caches.delete(name);
      }
      /* Take over pages that are already open. Without this a first install
         controls nothing until the next navigation, so it sees no requests and
         caches nothing. */
      await self.clients.claim();
    })(),
  );
});

/* ------------------------------------------------------------- strategies -- */

/* Caching must never be able to fail the request it is caching: cache.put()
   rejects for reasons unrelated to the response (quota, partial content), and a
   rejection inside respondWith() kills the request. */
async function putQuietly(cache, request, response) {
  try {
    await cache.put(request, response);
  } catch (error) {
    console.warn("[sw] could not cache", request.url, error);
  }
}

/** Content-hashed URLs, so a cached copy can never be stale. */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;

  const response = await fetch(request);
  if (response.ok) await putQuietly(cache, request, response.clone());
  return response;
}

/** Fresh HTML whenever there is a network, the cached copy when there isn't. */
async function navigationFirst(request) {
  const cache = await caches.open(SHELL_CACHE);

  try {
    const response = await fetch(request);
    if (response.ok) await putQuietly(cache, request, response.clone());
    return response;
  } catch (error) {
    /* ignoreVary: Next sends `Vary: rsc, next-router-*` to separate RSC payloads
       from HTML, but only one representation is ever stored under this key. */
    const hit = await cache.match(request, { ignoreVary: true });
    if (hit) return hit;
    throw error;
  }
}

/* ---------------------------------------------------------------- routing -- */

function isStaticAsset(url) {
  return (
    url.origin === self.location.origin &&
    url.pathname.startsWith("/_next/static/")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only GETs are cacheable, and nothing else is ours to interfere with.
  if (request.method !== "GET") return;

  if (isStaticAsset(new URL(request.url))) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  /* Navigations only — a document load or reload. In-app link clicks fetch an
     RSC payload instead and fall through to the network untouched. */
  if (request.mode === "navigate") {
    event.respondWith(navigationFirst(request));
  }
});
