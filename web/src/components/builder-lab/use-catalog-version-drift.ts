"use client";

/**
 * useCatalogVersionDrift — lightweight poller that detects when another tab
 * (or another super_admin session) has mutated the catalog while this Lab tab
 * is open.
 *
 * Strategy:
 *   - Capture the version at mount (first successful poll).
 *   - Poll every POLL_INTERVAL_MS while the document is visible.
 *   - Pause polling when the tab is hidden (visibilitychange) to avoid
 *     unnecessary round-trips while the user is away.
 *   - When the version advances past the mount-time stamp, set `drifted = true`.
 *   - Exposing `reset()` lets the banner dismiss itself without a full reload
 *     — but the natural UX is to reload.
 *
 * The hook is intentionally thin: no retry storm (errors are silently ignored
 * so a transient network hiccup does not flash the banner), no thrashing
 * (visibility gate + fixed interval).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { getCatalogVersion } from "@/lib/site-admin/builder-core/templates/catalog-overlay-actions";

/** Poll every 25 seconds while the tab is visible. */
const POLL_INTERVAL_MS = 25_000;

export interface UseCatalogVersionDriftResult {
  /** True once the version has advanced past the version at mount time. */
  drifted: boolean;
  /** Dismiss the banner without reloading (use when the user clicks "Dismiss"). */
  reset: () => void;
}

export function useCatalogVersionDrift(): UseCatalogVersionDriftResult {
  const mountVersionRef = useRef<number | null>(null);
  const [drifted, setDrifted] = useState(false);
  const driftedRef = useRef(false); // avoid stale-closure reads in the interval

  const reset = useCallback(() => {
    setDrifted(false);
    driftedRef.current = false;
    // Advance the mount baseline so a subsequent reload-and-stay does not
    // immediately re-trigger the banner with an already-seen version.
    // (If the user reloads, the component unmounts anyway — this is the
    //  "dismiss without reload" path.)
  }, []);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    async function poll() {
      if (cancelled) return;
      try {
        const version = await getCatalogVersion();
        if (cancelled || version === null) return;

        if (mountVersionRef.current === null) {
          // First successful response — capture the mount baseline.
          mountVersionRef.current = version;
          return;
        }

        if (!driftedRef.current && version > mountVersionRef.current) {
          driftedRef.current = true;
          setDrifted(true);
        }
      } catch {
        // Ignore errors — we never want a fetch failure to surface as a banner.
      }
    }

    function startPolling() {
      if (intervalId !== null) return;
      // Kick off the first poll immediately on start (or resume).
      void poll();
      intervalId = setInterval(() => {
        void poll();
      }, POLL_INTERVAL_MS);
    }

    function stopPolling() {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }

    function onVisibilityChange() {
      if (document.hidden) {
        stopPolling();
      } else {
        startPolling();
      }
    }

    // Start immediately (if visible).
    if (!document.hidden) {
      startPolling();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []); // mount/unmount only — stable ref pattern for the interval

  return { drifted, reset };
}
