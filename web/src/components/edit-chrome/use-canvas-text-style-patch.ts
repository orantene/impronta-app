"use client";

import { useCallback, useEffect, useRef } from "react";

import { applyCanvasTextStylePreview } from "./canvas-text-style-preview";
import {
  notifyCanvasOverlayStylePatch,
  registerCanvasTextStylePatchCanceller,
  registerCanvasTextStylePatchFlusher,
} from "./canvas-lexical-bridge";

const STYLE_PATCH_DEBOUNCE_MS = 480;

/** Match bulk-style patch semantics: `undefined` deletes the key. */
function mergeTopLevelStylePatch(
  prev: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const next = { ...prev };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

interface PendingStylePatch {
  nodeId: string;
  patch: Record<string, unknown>;
}

interface Options {
  nodeId: string | null;
  getNodeStyle: (nodeId: string) => Record<string, unknown> | undefined;
  patchBuilderNodeProps: (
    nodeId: string,
    patch: Record<string, unknown>,
  ) => Promise<{ ok: boolean; error?: string }>;
  /**
   * While inline canvas text edit is open, only update the overlay preview.
   * Defer builder-tree commits until edit ends — avoids repainting the whole
   * client canvas mid-edit (which breaks the overlay and causes massive lag).
   */
  deferTreeCommit?: boolean;
}

/**
 * Toolbar style edits preview instantly on the canvas; tree commit is debounced
 * so rapid align/font tweaks don't repaint the whole client canvas per click.
 */
export function useCanvasTextStylePatch({
  nodeId,
  getNodeStyle,
  patchBuilderNodeProps,
  deferTreeCommit = false,
}: Options) {
  const pendingRef = useRef<PendingStylePatch | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const getNodeStyleRef = useRef(getNodeStyle);
  const patchRef = useRef(patchBuilderNodeProps);
  const deferRef = useRef(deferTreeCommit);

  useEffect(() => {
    getNodeStyleRef.current = getNodeStyle;
  }, [getNodeStyle]);

  useEffect(() => {
    patchRef.current = patchBuilderNodeProps;
  }, [patchBuilderNodeProps]);

  useEffect(() => {
    deferRef.current = deferTreeCommit;
  }, [deferTreeCommit]);

  const flushPendingStylePatch = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    if (!pending || Object.keys(pending.patch).length === 0) return;
    const { nodeId: targetId, patch } = pending;
    pendingRef.current = { nodeId: targetId, patch: {} };
    const prevStyle = getNodeStyleRef.current(targetId) ?? {};
    await patchRef.current(targetId, {
      style: mergeTopLevelStylePatch(prevStyle, patch),
    });
    // NOTE: tracking is deliberately NOT released on commit. A committed patch
    // does not guarantee a repaint of this node: on a surface with no client
    // canvas mounted for it the canvas is server-rendered, and undo/redo skip
    // the RSC refresh, so React never rewrites the property. The stamped value
    // would then survive the undo and the canvas would keep showing the undone
    // size. Tracking therefore lives until something authoritative clears it.
  }, []);

  /**
   * Drop a debounced patch instead of flushing it. Undo/redo restore a tree
   * that predates the patch, so a flush landing in the 480ms window would
   * re-apply the very edit being undone, on top of the restored tree.
   */
  const cancelPendingStylePatch = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingRef.current = null;
  }, []);

  const scheduleFlush = useCallback(() => {
    if (deferRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void flushPendingStylePatch();
    }, STYLE_PATCH_DEBOUNCE_MS);
  }, [flushPendingStylePatch]);

  const patchTextStyle = useCallback(
    (patch: Record<string, unknown>) => {
      if (!nodeId) return;
      if (!deferRef.current) {
        applyCanvasTextStylePreview(nodeId, patch);
      }
      notifyCanvasOverlayStylePatch(patch);
      const pending = pendingRef.current;
      if (!pending || pending.nodeId !== nodeId) {
        pendingRef.current = { nodeId, patch: { ...patch } };
      } else {
        pending.patch = { ...pending.patch, ...patch };
      }
      scheduleFlush();
    },
    [nodeId, scheduleFlush],
  );

  useEffect(() => {
    registerCanvasTextStylePatchFlusher(flushPendingStylePatch);
    return () => registerCanvasTextStylePatchFlusher(null);
  }, [flushPendingStylePatch]);

  useEffect(() => {
    registerCanvasTextStylePatchCanceller(cancelPendingStylePatch);
    return () => registerCanvasTextStylePatchCanceller(null);
  }, [cancelPendingStylePatch]);

  useEffect(() => {
    if (deferTreeCommit) return;
    void flushPendingStylePatch();
  }, [deferTreeCommit, flushPendingStylePatch]);

  useEffect(() => {
    return () => {
      void flushPendingStylePatch();
    };
  }, [nodeId, flushPendingStylePatch]);

  return { patchTextStyle, flushPendingStylePatch, cancelPendingStylePatch };
}
