"use client";

/**
 * use-layout-flatten-warning — DEPTH-CAP HONESTY.
 *
 * The draft-save normalizer flattens wrapper chains deeper than the shared
 * nesting cap (`BUILDER_MAX_TREE_DEPTH`). Content is never dropped — that is the
 * normalizer's load-bearing invariant — but the LAYOUT changes, and it used to
 * change silently. From where the operator sits, a save that quietly rewrites
 * their structure is indistinguishable from the editor corrupting the page.
 *
 * This hook is the whole notice path in one place:
 *   • `warnIfSaveWillFlatten(tree)` runs the SAME depth pass the server runs, on
 *     the exact tree the editor is about to send. It is the shared
 *     `collectBuilderTreeFlattenNotices` rather than a local re-implementation on
 *     purpose: a second copy of "would this flatten?" in the client is exactly
 *     how a warning drifts out of sync with the write and starts lying. The pass
 *     is one subtree-height walk over a tree already in memory, so it costs
 *     nothing on the (overwhelmingly common) path where nothing is over-deep.
 *   • the resulting toast is STICKY — it has no ttl and is cleared only by the
 *     operator. A structural change to their own work is acknowledged, not
 *     blinked past in five seconds.
 *   • it COALESCES on the block set: a debounced autosave burst re-saves the same
 *     over-deep tree many times, and the operator should be told once per
 *     distinct restructure, not once per keystroke.
 *
 * Rendering lives in `layout-flatten-toast.tsx`; `layout-flatten-notice-wiring.
 * static.test.ts` pins the whole chain so the notice cannot become a flag nobody
 * surfaces.
 */

import { useCallback, useRef, useState } from "react";

import { collectBuilderTreeFlattenNotices } from "@/lib/site-admin/builder-node/normalize-tree-layout";

import type { BuilderLayoutFlattenToast } from "./edit-context-toast-types";

export function useLayoutFlattenWarning(): {
  layoutFlattenToast: BuilderLayoutFlattenToast | null;
  clearLayoutFlattenToast: () => void;
  warnIfSaveWillFlatten: (tree: unknown) => void;
} {
  const [layoutFlattenToast, setLayoutFlattenToast] =
    useState<BuilderLayoutFlattenToast | null>(null);
  const layoutFlattenNonceRef = useRef(0);
  const layoutFlattenSeenRef = useRef<string>("");

  const clearLayoutFlattenToast = useCallback(
    () => setLayoutFlattenToast(null),
    [],
  );

  const warnIfSaveWillFlatten = useCallback((tree: unknown) => {
    const notices = collectBuilderTreeFlattenNotices(tree);
    if (notices.length === 0) return;
    const labels = notices.map((notice) =>
      notice.sectionLabel ? `${notice.label} — in ${notice.sectionLabel}` : notice.label,
    );
    const fingerprint = labels.join("|");
    if (layoutFlattenSeenRef.current === fingerprint) return;
    layoutFlattenSeenRef.current = fingerprint;
    layoutFlattenNonceRef.current += 1;
    setLayoutFlattenToast({
      labels: labels.slice(0, 3),
      count: labels.length,
      nonce: layoutFlattenNonceRef.current,
    });
  }, []);

  return { layoutFlattenToast, clearLayoutFlattenToast, warnIfSaveWillFlatten };
}
