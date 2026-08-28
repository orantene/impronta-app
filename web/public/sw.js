// Tulala Production Service Worker
//
// Strategy summary:
//   - NEVER cache: authenticated HTML, /api/*, Supabase requests, auth paths.
//   - Network-first for all navigation (HTML) requests. Falls back to /offline
//     when offline and no cached copy exists.
//   - Stale-while-revalidate for /_next/static/* and image assets (long TTL,
//     content-addressed so staleness is never a correctness issue).
//   - Cache-first for the /offline fallback page itself.
//   - Draft persistence via IndexedDB: handles tulala-draft-save / -load / -clear
//     messages from profile-store.ts exactly as the prototype SW did.
//
// Versioning: bump CACHE_VERSION when you need to invalidate all caches.

const CACHE_VERSION = "v1";
const STATIC_CACHE = `tulala-static-${CACHE_VERSION}`;
const OFFLINE_CACHE = `tulala-offline-${CACHE_VERSION}`;
const ALL_CACHE_PREFIXES = ["tulala-static-", "tulala-offline-"];

const OFFLINE_PAGE = "/offline";

// ─── Install ─────────────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) =>
        cache.add(OFFLINE_PAGE).catch(() => {
          // If /offline isn't available yet (e.g. cold deploy), fail silently.
          // The network-first fetch will just surface a browser offline page.
        })
      )
      .then(() => self.skipWaiting())
  );
});

// ─── Activate ────────────────────────────────────────────────────────────────

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (k) =>
                ALL_CACHE_PREFIXES.some((p) => k.startsWith(p)) &&
                k !== STATIC_CACHE &&
                k !== OFFLINE_CACHE
            )
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── Fetch ───────────────────────────────────────────────────────────────────

/**
 * Returns true for URLs that must NEVER be cached — authed HTML, API routes,
 * Supabase, auth callbacks, checkout. A misconfigured cache here would serve
 * stale session data or bypass auth redirects.
 */
function isUncacheable(url) {
  const p = url.pathname;
  // Any external origin (Supabase, Stripe, etc.)
  if (url.origin !== self.location.origin) return true;
  // API routes (includes edge functions proxied under /api)
  if (p.startsWith("/api/")) return true;
  // Auth flows — never cache; stale tokens = broken login
  if (p.startsWith("/auth/")) return true;
  if (p.startsWith("/login") || p.startsWith("/logout")) return true;
  // Checkout surfaces
  if (p.startsWith("/checkout")) return true;
  return false;
}

/** Returns true for /_next/static/* and common image/font extensions. */
function isStaticAsset(url) {
  const p = url.pathname;
  if (p.startsWith("/_next/static/")) return true;
  if (p.startsWith("/_next/image")) return true;
  if (/\.(png|jpg|jpeg|webp|avif|gif|svg|ico|woff2?|ttf|otf)$/i.test(p))
    return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only intercept GET; let mutations pass through unchanged.
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  // Hard pass-through for uncacheable URLs.
  if (isUncacheable(url)) return;

  if (isStaticAsset(url)) {
    // Stale-while-revalidate for content-addressed static assets.
    event.respondWith(staleWhileRevalidate(req, STATIC_CACHE));
    return;
  }

  if (req.mode === "navigate") {
    // Network-first for HTML navigations; fall back to /offline.
    event.respondWith(networkFirstWithOfflineFallback(req));
    return;
  }

  // All other same-origin GETs: network-first, no cache storage.
  // (manifest.webmanifest, public icons, etc. are served fresh.)
});

async function networkFirstWithOfflineFallback(req) {
  try {
    const res = await fetch(req);
    // Do NOT cache the response — navigations may be behind auth middleware.
    return res;
  } catch {
    // Offline: try the cached /offline page.
    const cached = await caches.match(OFFLINE_PAGE, { cacheName: OFFLINE_CACHE });
    if (cached) return cached;
    // Absolute last resort — a minimal inline response.
    return new Response(
      "<!doctype html><html><head><meta charset=utf-8><title>Offline</title></head><body><p>You are offline. Please reconnect and try again.</p></body></html>",
      {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }
    );
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  // Kick off a background revalidation regardless of cache hit.
  const revalidate = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);

  // Return the cached version immediately if available; otherwise wait for network.
  return cached || revalidate;
}

// ─── Message handling (draft persistence) ────────────────────────────────────
//
// profile-store.ts posts three message types to navigator.serviceWorker.controller:
//   { type: "tulala-draft-save",  id: string, data: ProfileDraft }
//   { type: "tulala-draft-load",  id: string }   — response via MessageChannel port
//   { type: "tulala-draft-clear", id: string }
//
// IndexedDB shape: db "tulala-drafts" v1 -> store "drafts", keyPath "id".
// Each row: { id: string, data: ProfileDraft, savedAt: number }.

function withDb(work) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("tulala-drafts", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("drafts")) {
        db.createObjectStore("drafts", { keyPath: "id" });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      try {
        work(db, resolve, reject);
      } catch (e) {
        reject(e);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;
  const port = event.ports && event.ports[0];

  if (data.type === "tulala-draft-save") {
    const id = data.id || "default";
    withDb((db, resolve, reject) => {
      const tx = db.transaction("drafts", "readwrite");
      tx.objectStore("drafts").put({ id, data: data.data, savedAt: Date.now() });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    })
      .then(() => {
        if (port) port.postMessage({ ok: true });
      })
      .catch((err) => {
        if (port) port.postMessage({ ok: false, error: String(err) });
      });
    return;
  }

  if (data.type === "tulala-draft-load") {
    const id = data.id || "default";
    withDb((db, resolve, reject) => {
      const tx = db.transaction("drafts", "readonly");
      const get = tx.objectStore("drafts").get(id);
      get.onsuccess = () => resolve(get.result || null);
      get.onerror = () => reject(get.error);
    })
      .then((row) => {
        if (port) port.postMessage({ ok: true, row });
      })
      .catch((err) => {
        if (port) port.postMessage({ ok: false, error: String(err) });
      });
    return;
  }

  if (data.type === "tulala-draft-clear") {
    const id = data.id || "default";
    withDb((db, resolve, reject) => {
      const tx = db.transaction("drafts", "readwrite");
      tx.objectStore("drafts").delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    })
      .then(() => {
        if (port) port.postMessage({ ok: true });
      })
      .catch((err) => {
        if (port) port.postMessage({ ok: false, error: String(err) });
      });
    return;
  }

  // SKIP_WAITING - sent by the register component to activate a waiting SW
  // without requiring a full tab close/reopen.
  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ─── PUSH NOTIFICATIONS - do not entangle with caching above ─────────────────
self.addEventListener("push", (event) => {
  let data = { title: "Tulala", body: "", url: "/" };
  try {
    if (event.data) {
      const parsed = event.data.json();
      if (parsed && typeof parsed === "object") {
        data = { ...data, ...parsed };
      }
    }
  } catch {
    /* ignore malformed payloads */
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Tulala", {
      body: data.body || "",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url =
    event.notification.data && event.notification.data.url
      ? event.notification.data.url
      : "/";
  event.waitUntil(self.clients.openWindow(url));
});
