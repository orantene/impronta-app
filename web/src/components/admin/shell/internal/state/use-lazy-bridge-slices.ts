"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";

import { loadBridgeSlicesAction } from "@/app/(workspace)/[tenantSlug]/admin/_bridge-slice-actions";
import { logServerError } from "@/lib/server/safe-error";

import { slicesForPage, type BridgeSliceName } from "../bridge-slices";
import type { BridgeData } from "../data-bridge";
import type { WorkspacePage } from "./types";

/**
 * The bridge as the shell reads it, plus the wait for its late slices.
 *
 * The layout loads the chrome and THIS page's slices before the first byte;
 * every other slice is named in `initialBridgeData.lazySlices` and fetched
 * here, once, in one server action after hydration (bridge-slices.ts has the
 * why). Until a slice arrives, `pageSlicesReady(page)` is false for the pages
 * that read it and the PageRouter shows the page's skeleton instead of an
 * empty (or mock) body. Resolved or refused, the wait ends: a page that reads
 * a slice the server would not give renders its real empty state, never a
 * skeleton forever.
 */
export function useLazyBridgeSlices(
  initialBridgeData: BridgeData | null,
  tenantSlugRef: MutableRefObject<string | undefined>,
): {
  bridge: BridgeData | null;
  pageSlicesReady: (page: WorkspacePage) => boolean;
} {
  const lazySliceNames = initialBridgeData?.lazySlices ?? null;
  const [lateSlices, setLateSlices] = useState<Partial<BridgeData>>({});
  const [pendingSlices, setPendingSlices] = useState<ReadonlySet<BridgeSliceName>>(
    () => new Set(lazySliceNames ?? []),
  );
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    const slug = tenantSlugRef.current;
    if (!slug || !lazySliceNames || lazySliceNames.length === 0) return;
    started.current = true;
    let cancelled = false;
    loadBridgeSlicesAction(slug, lazySliceNames)
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setLateSlices((prev) => ({ ...prev, ...res.slices }));
        else logServerError("admin-shell.lazySlices", new Error(res.error));
      })
      .catch((err: unknown) => {
        if (!cancelled) logServerError("admin-shell.lazySlices", err);
      })
      .finally(() => {
        if (!cancelled) setPendingSlices(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [lazySliceNames, tenantSlugRef]);

  const pageSlicesReady = useCallback(
    (page: WorkspacePage) => {
      if (pendingSlices.size === 0) return true;
      return !slicesForPage(page).some((name) => pendingSlices.has(name));
    },
    [pendingSlices],
  );

  // What the server sent, with the late slices merged over it. Slice fields
  // read from this, never from `initialBridgeData` directly.
  const bridge = useMemo<BridgeData | null>(
    () => (initialBridgeData ? { ...initialBridgeData, ...lateSlices } : null),
    [initialBridgeData, lateSlices],
  );

  return { bridge, pageSlicesReady };
}
