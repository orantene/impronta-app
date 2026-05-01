// Tulala prototype Service Worker — offline draft persistence.
//
// Scope: prototype-only. Registered ONLY when the user is on
// `/prototypes/admin-shell/*`. Production app currently does not use
// a service worker (gated by the registration call's path filter).
//
// What it does:
//   1. Caches the prototype's static assets on first install so the
//      shell renders even on a flaky connection.
//   2. Listens for `tulala-draft-save` messages from the page and
//      mirrors the payload into IndexedDB. The page already writes to
//      sessionStorage via _profile-store; this SW gives durability
//      across tab close + offline.
//   3. Exposes `tulala-draft-load` so reopening the prototype on the
//      same device hydrates the in-flight profile.
//
// IndexedDB shape: db `tulala-prototype` v1 → object store `drafts`,
// keyed by the draft id (default = "default"). Each value is a JSON
// blob `{ data, savedAt }`.

const CACHE_NAME = "tulala-prototype-v1";
const PRECACHE = [
  "/prototypes/admin-shell",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(PRECACHE).catch(() => {
        // Pre-cache is best-effort; missing assets shouldn't kill install.
      })
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME && k.startsWith("tulala-prototype-"))
            .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Network-first for HTML, cache-first for static assets.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Only handle prototype routes
  if (!url.pathname.startsWith("/prototypes/admin-shell") && !url.pathname.startsWith("/_next/static")) return;

  if (req.mode === "navigate") {
    // Network-first, fall back to cached prototype shell when offline.
    event.respondWith(
      fetch(req).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        return res;
      }).catch(() => caches.match("/prototypes/admin-shell"))
    );
    return;
  }
  // Cache-first for static
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const clone = res.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
      return res;
    }))
  );
});

// IndexedDB helpers
function withDb(work) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("tulala-prototype", 1);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains("drafts")) {
        db.createObjectStore("drafts", { keyPath: "id" });
      }
    };
    open.onsuccess = () => {
      const db = open.result;
      try {
        work(db, resolve, reject);
      } catch (e) {
        reject(e);
      }
    };
    open.onerror = () => reject(open.error);
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
    }).then(() => {
      if (port) port.postMessage({ ok: true });
    }).catch((err) => {
      if (port) port.postMessage({ ok: false, error: String(err) });
    });
    return;
  }

  if (data.type === "tulala-draft-load") {
    const id = data.id || "default";
    withDb((db, resolve, reject) => {
      const tx = db.transaction("drafts", "readonly");
      const req = tx.objectStore("drafts").get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    }).then((row) => {
      if (port) port.postMessage({ ok: true, row });
    }).catch((err) => {
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
    }).then(() => {
      if (port) port.postMessage({ ok: true });
    }).catch((err) => {
      if (port) port.postMessage({ ok: false, error: String(err) });
    });
  }
});
