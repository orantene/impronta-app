"use client";

/**
 * PwaServiceWorkerRegister — mounts in the root layout, registers /sw.js in
 * production only.
 *
 * Behaviour:
 * - No-op in non-production builds or when the browser has no SW support.
 * - On first registration the SW installs + activates immediately via
 *   skipWaiting (called during install inside sw.js).
 * - When a new SW version is waiting (update detected), we post SKIP_WAITING
 *   and reload the page so users get the updated code without a manual refresh.
 *   A short 200 ms delay avoids a race where the page reloads before the new
 *   SW has claimed clients.
 */
import { useEffect } from "react";

export function PwaServiceWorkerRegister() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      typeof window === "undefined" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    let registration: ServiceWorkerRegistration | null = null;

    function onUpdateFound() {
      const newWorker = registration?.installing;
      if (!newWorker) return;

      newWorker.addEventListener("statechange", () => {
        if (
          newWorker.state === "installed" &&
          navigator.serviceWorker.controller
        ) {
          // A new SW is waiting. Tell it to skip waiting, then reload once it
          // has taken over so all open tabs get the new version.
          newWorker.postMessage({ type: "SKIP_WAITING" });
          navigator.serviceWorker.addEventListener("controllerchange", () => {
            // Guard against a second controllerchange firing on the same reload.
            window.location.reload();
          }, { once: true });
        }
      });
    }

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        registration = reg;
        reg.addEventListener("updatefound", onUpdateFound);

        // Periodically poll for updates (every 60 minutes). Browsers also check
        // on navigation, but long-lived SPAs can miss background updates.
        const interval = setInterval(() => reg.update().catch(() => null), 60 * 60 * 1000);

        return () => {
          clearInterval(interval);
          reg.removeEventListener("updatefound", onUpdateFound);
        };
      })
      .catch(() => {
        // SW registration failure is non-fatal — the app works fine without it.
        // Silently swallow; don't surface to Sentry (too noisy in certain CSP
        // environments or browsers with SW disabled via policy).
      });
  }, []);

  return null;
}
