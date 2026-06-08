"use client";

import { useCallback, useEffect, useRef } from "react";

import { applyCanvasTextStylePreview } from "./canvas-text-style-preview";
import {
  notifyCanvasOverlayStylePatch,
  registerCanvasTextStylePatchFlusher,
} from "./canvas-lexical-bridge";

const STYLE_PATCH_DEBOUNCE_MS = 480;

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
      style: { ...prevStyle, ...patch },
    });
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
    if (deferTreeCommit) return;
    void flushPendingStylePatch();
  }, [deferTreeCommit, flushPendingStylePatch]);

  useEffect(() => {
    return () => {
      void flushPendingStylePatch();
    };
  }, [nodeId, flushPendingStylePatch]);

  return { patchTextStyle, flushPendingStylePatch };
}
