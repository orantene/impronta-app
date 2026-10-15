"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** Browser host (hydration-safe: null on the server and first paint). */
export function useRequestHost(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => window.location.host,
    () => null,
  );
}
