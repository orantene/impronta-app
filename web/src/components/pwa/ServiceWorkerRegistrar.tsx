"use client";

import { useEffect } from "react";

/**
 * PWA Service Worker Registrar — M2 conservative baseline.
 *
 * Registers /sw.js after the page loads (deferred via window load event) so
 * the SW never blocks first-paint or hydration. On every page load it also
 * checks whether a newer SW is waiting to activate; if so it posts
 * SKIP_WAITING to activate it cleanly (the next navigation picks up the new
 * build).
 *
 * Mounted once in the root layout (server component) via a null-returning
 * client component — the only pattern that works for global side-effects in
 * the App Router without adding a provider tree node.
 *
 * To disable the entire SW: remove this component from the root layout
 * (or delete public/sw.js). No other changes are required.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", {
          scope: "/",
          // Never serve a stale SW script — always re-fetch the sw.js file
          // from the network so new deploys are picked up promptly.
          updateViaCache: "none",
        })
        .then((registration) => {
          // If a new SW is already waiting (e.g. this is a second tab open
          // after a deploy), prompt it to skip waiting immediately.
          if (registration.waiting) {
            registration.waiting.postMessage({ type: "SKIP_WAITING" });
          }

          // Watch for a new SW arriving in the future (deploy while the tab
          // is open). When it finishes installing and enters "waiting", tell
          // it to skip waiting so the next navigation picks it up.
          registration.addEventListener("updatefound", () => {
            const incoming = registration.installing;
            if (!incoming) return;
            incoming.addEventListener("statechange", () => {
              if (
                incoming.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                incoming.postMessage({ type: "SKIP_WAITING" });
              }
            });
          });
        })
        .catch((err) => {
          // SW registration failure is non-fatal — the app works without a SW.
          // Log at warn level only so we can diagnose CSP/scope issues in dev.
          console.warn("[SW] Registration failed:", err);
        });
    };

    // Defer until after load so we never compete with critical resource fetches.
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }
  }, []);

  return null;
}
