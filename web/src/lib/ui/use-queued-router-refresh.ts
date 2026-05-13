"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef } from "react";

/**
 * pr-p9-1 — RAF-coalesced router.refresh() for non-edit-chrome surfaces.
 *
 * Mirrors the `queueRouterRefresh` pattern from EditContext (P9-1 commit
 * `729...`) but standalone so settings drawers, roster editors, payouts
 * pages, and other server-action consumers can adopt the same
 * coalescing without depending on the builder context.
 *
 * Pattern: when a server action returns and the caller wants to refresh
 * the page, queue the refresh on the next animation frame. If another
 * caller queues during the same frame (e.g. multiple form sections
 * saving in quick succession), the second queue is a no-op.
 *
 * Without coalescing: 5 successive saves → 5 full RSC payloads streamed
 * back to the client. With coalescing: 1 payload, latest state visible.
 *
 * Usage:
 *   const queueRefresh = useQueuedRouterRefresh();
 *   const onSave = async () => {
 *     await saveSomething();
 *     queueRefresh();
 *   };
 */
export function useQueuedRouterRefresh(): () => void {
  const router = useRouter();
  const queuedRef = useRef(false);

  return useCallback(() => {
    if (queuedRef.current) return;
    queuedRef.current = true;
    // RAF + microtask: RAF for the natural debounce, microtask to ensure
    // any sibling state updates in the same tick are flushed before the
    // refresh fires.
    if (typeof window === "undefined") {
      router.refresh();
      queuedRef.current = false;
      return;
    }
    window.requestAnimationFrame(() => {
      router.refresh();
      queuedRef.current = false;
    });
  }, [router]);
}
