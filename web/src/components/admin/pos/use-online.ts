"use client";

/**
 * useOnline — `navigator.onLine` as React state, through
 * `useSyncExternalStore` so the server render and the first client render
 * agree (both say online) and the browser's own `online` / `offline` events
 * drive every change after that. No effect, no timer: the one fact the
 * counter's `Offline · cash only` chip and Connection screen are built on.
 */

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (typeof navigator === "undefined" ? true : navigator.onLine),
    () => true,
  );
}
