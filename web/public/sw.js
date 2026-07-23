/**
 * Tulala PWA Service Worker — M2 conservative baseline.
 *
 * Strategy matrix
 * ───────────────
 * /_next/static/**   → cache-first (content-addressed, immutable)
 * /brand/**          → stale-while-revalidate (icons, logos)
 * /offline           → precached at install for the offline fallback
 * navigate           → network-only, fallback /offline when both fail
 * /api/**            → NEVER cached (pass-through)
 * anything Supabase  → NEVER cached (pass-through; cross-origin anyway)
 * auth routes        → NEVER cached (pass-through)
 * everything else    → network-only (safe default)
 *
 * Update flow
 * ───────────
 * The SW skips waiting immediately on install so a new deploy is active
 * as soon as all tabs close (or the user refreshes twice in most browsers).
 * The registrar component in ServiceWorkerRegistrar.tsx also posts a
 * SKIP_WAITING message when it detects a waiting worker, so a
 * page-reload after a deploy activates the new SW without manual
 * intervention. clientsClaim() on activate ensures the new SW controls
 * all open pages immediately after activation.
 *
 * To completely disable: remove the <ServiceWorkerRegistrar /> mount in
 * web/src/components/pwa/ServiceWorkerRegistrar.tsx (or delete this file).
 */

// ─── Cache names ─────────────────────────────────────────────────────────────
// Bump the suffix when the caching strategy changes so stale caches are pruned.
const STATIC_CACHE = "tulala-static-v1";
const OFFLINE_CACHE = "tulala-offline-v1";

// The offline fallback page. Must exist at this path in the app.
const OFFLINE_URL = "/offline";

// ─── Install ─────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) =>
        // Best-effort: if /offline is unavailable at install time (e.g. cold
        // start with no network) we still install — users just won't get the
        // branded offline page, they'll see the browser default.
        cache.add(OFFLINE_URL).catch(() => {
          console.warn("[SW] Could not precache /offline page — skipping.");
        }),
      )
      .then(() => self.skipWaiting()),
  );
});

// ─── Activate ────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  const keepCaches = new Set([STATIC_CACHE, OFFLINE_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (k) =>
                // Prune own stale caches only; leave the prototype SW's caches alone.
                (k.startsWith("tulala-static-") || k.startsWith("tulala-offline-")) &&
                !keepCaches.has(k),
            )
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ─── Message handler ─────────────────────────────────────────────────────────
// The registrar posts SKIP_WAITING when a new SW is waiting.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ─── Fetch handler ───────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only intercept GET requests.
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // ── 1. Cross-origin pass-through ────────────────────────────────────────
  // Supabase, Stripe, Maps, Sentry, analytics — never touch them.
  if (url.origin !== self.location.origin) return;

  // ── 2. API routes — NEVER cache ─────────────────────────────────────────
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    // Next.js internals (RSC payloads, prefetch)
    url.pathname.startsWith("/_next/data/")
  ) {
    return; // Let the browser handle it natively.
  }

  // ── 3. Next.js static build assets — cache-first ────────────────────────
  // These are content-addressed (e.g. /_next/static/chunks/abc123.js) and
  // never change for a given URL, so cache-first is safe.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          if (cached) return cached;
          return fetch(req).then((res) => {
            // Only cache successful responses.
            if (res && res.status === 200) {
              cache.put(req, res.clone());
            }
            return res;
          });
        }),
      ),
    );
    return;
  }

  // ── 4. Brand/public assets — stale-while-revalidate ─────────────────────
  // Icons, manifest logo, marketing images. These change rarely; SWR gives
  // instant response + background update.
  if (
    url.pathname.startsWith("/brand/") ||
    url.pathname === "/manifest.webmanifest" ||
    (url.pathname.startsWith("/") &&
      /\.(png|svg|ico|webp|avif|jpg|jpeg|woff2?|ttf|otf)$/.test(
        url.pathname,
      ))
  ) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          const networkFetch = fetch(req).then((res) => {
            if (res && res.status === 200) {
              cache.put(req, res.clone());
            }
            return res;
          });
          // Return cached version immediately; let the network update run in the
          // background. If there's no cache, wait for the network.
          return cached ?? networkFetch;
        }),
      ),
    );
    return;
  }

  // ── 5. Navigation requests — network-only with offline fallback ──────────
  // HTML pages (including authed surfaces) are NEVER cached to avoid serving
  // stale auth state, stale Supabase RLS-derived data, or a stale session.
  // If the network fails, serve the precached /offline page.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() =>
        caches
          .match(OFFLINE_URL, { cacheName: OFFLINE_CACHE })
          .then(
            (fallback) =>
              fallback ??
              new Response("You are offline.", {
                status: 503,
                headers: { "Content-Type": "text/plain" },
              }),
          ),
      ),
    );
    return;
  }

  // ── 6. Everything else — network-only (safe default) ────────────────────
  // Server Actions, RSC payloads, prefetch requests, etc.
  // Just let the browser handle them normally — no SW interception.
});
