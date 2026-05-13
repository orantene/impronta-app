"use client";

import { useEffect, useState } from "react";
import { formatRelativeTime, type RelativeTimeOptions } from "./relative-time";

/**
 * Auto-refreshing relative time string (G.5).
 *
 * Pass an ISO timestamp; the returned string updates every minute (or
 * every 10s for timestamps under 2 minutes old) so "5m ago" eventually
 * becomes "6m ago" without a hard page reload.
 *
 * Multiple instances share a single document-wide tick so a list of 50
 * rows costs one timer, not fifty.
 */
const tickListeners = new Set<() => void>();
let tickTimer: ReturnType<typeof setInterval> | null = null;

function ensureTicker() {
  if (tickTimer !== null) return;
  tickTimer = setInterval(() => {
    tickListeners.forEach((fn) => fn());
  }, 30_000);
}

function subscribe(fn: () => void): () => void {
  tickListeners.add(fn);
  ensureTicker();
  return () => {
    tickListeners.delete(fn);
    if (tickListeners.size === 0 && tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  };
}

export function useRelativeTime(
  iso: string | Date | null | undefined,
  opts?: RelativeTimeOptions,
): string {
  const [, force] = useState(0);

  useEffect(() => {
    return subscribe(() => force((n) => n + 1));
  }, []);

  if (!iso) return "";
  return formatRelativeTime(iso, opts);
}
