"use client";

/**
 * The four canvas box-model commits: resize, padding, margin, gap.
 *
 * All four had the same shape already (find the node, read `props.style`,
 * merge one or two keys, save) and all four gained the same new
 * responsibility at once when the phone/tablet canvas became editable: route
 * the write through `buildResponsiveCanvasStyle` so a drag taken on a device
 * canvas lands in `style.responsive[tier]` and leaves the desktop value alone.
 *
 * They live here rather than in `selection-layer.tsx` because that file is
 * under a line-count ratchet with no headroom, and because four near-identical
 * commits drift when they are 150 lines apart in an 7,800-line component: the
 * bug this whole lane exists to prevent is one handle quietly still writing the
 * base style. Side by side, that is visible.
 *
 * The DELETE convention throughout: a `undefined` patch value drops the key. On
 * desktop that returns the block to its natural/token value; on a device canvas
 * it drops that tier's override, so the block goes back to INHERITING desktop
 * rather than to a hardcoded default.
 */

import { useCallback } from "react";

import type { BuilderNode } from "@/lib/site-admin/builder-node";

import type { MarginSide, PaddingSide } from "./canvas-spacing-handles";
import {
  buildResponsiveCanvasStyle,
  type CanvasStylePatch,
  type ResponsiveStyleBucket,
} from "./responsive-canvas-style";

export interface CanvasSizeCommit {
  width?: number | null;
  height?: number | null;
  /**
   * West/north-handle anchor compensation (keep the opposite edge planted)
   * rides in the SAME patch as the size, so it is one undo step.
   */
  translate?: { x: number; y: number };
}

export interface CanvasBoxModelCommits {
  readonly commitSize: (dims: CanvasSizeCommit) => void;
  readonly commitPadding: (side: PaddingSide, px: number) => void;
  readonly commitMargin: (side: MarginSide, px: number) => void;
  readonly commitGap: (px: number) => void;
}

const PADDING_KEY: Record<PaddingSide, string> = {
  top: "paddingTop",
  right: "paddingRight",
  bottom: "paddingBottom",
  left: "paddingLeft",
};

/**
 * The free margin escape (the same collision-safe `margin*Free` key the Style
 * panel writes), so the canvas drag and the panel field stay ONE value.
 */
const MARGIN_KEY: Record<MarginSide, string> = {
  top: "marginTopFree",
  right: "marginRightFree",
  bottom: "marginBottomFree",
  left: "marginLeftFree",
};

/** The inline-preview property each margin drag leaves on the live element. */
const MARGIN_INLINE_PROP: Record<MarginSide, "marginTop" | "marginRight" | "marginBottom" | "marginLeft"> = {
  top: "marginTop",
  right: "marginRight",
  bottom: "marginBottom",
  left: "marginLeft",
};

export function useCanvasBoxModelCommits({
  findNodeById,
  selectedBuilderNodeId,
  bucket,
  patchBuilderNodeProps,
  getSelectedBuilderNodeEl,
}: {
  /**
   * The caller's tree lookup. Passed in rather than imported: the finder lives
   * inside `selection-layer.tsx` next to the id-Map fast path it shares, and a
   * second copy here would be a second thing to keep correct.
   */
  readonly findNodeById: (nodeId: string) => BuilderNode | null;
  readonly selectedBuilderNodeId: string | null;
  /** `null` = desktop/base style; "tablet"/"mobile" = that override tier. */
  readonly bucket: ResponsiveStyleBucket;
  readonly patchBuilderNodeProps: (
    nodeId: string,
    patch: Record<string, unknown>,
  ) => Promise<{ ok: boolean; error?: string }>;
  readonly getSelectedBuilderNodeEl: () => HTMLElement | null;
}): CanvasBoxModelCommits {
  /**
   * Resolve the selected node's current style, or `null` when there is nothing
   * a box-model drag may write to (no selection, or a section — sections carry
   * their own presentation model, not `props.style`).
   */
  const currentStyle = useCallback((): Record<string, unknown> | null => {
    if (!selectedBuilderNodeId) return null;
    const node = findNodeById(selectedBuilderNodeId);
    if (!node || node.kind === "section") return null;
    return ((node.props as { style?: Record<string, unknown> } | undefined)
      ?.style ?? {}) as Record<string, unknown>;
  }, [findNodeById, selectedBuilderNodeId]);

  const commit = useCallback(
    (style: Record<string, unknown>, patch: CanvasStylePatch) => {
      if (!selectedBuilderNodeId) return;
      void patchBuilderNodeProps(selectedBuilderNodeId, {
        style: buildResponsiveCanvasStyle({ style, bucket, patch }),
      });
    },
    [bucket, patchBuilderNodeProps, selectedBuilderNodeId],
  );

  const commitSize = useCallback(
    (dims: CanvasSizeCommit) => {
      const style = currentStyle();
      if (!style) return;
      // Clear any leftover inline preview written during the drag, so a reset
      // (null) visibly returns the element to its content-driven size instead
      // of staying masked by the stale inline style until the next refresh.
      const liveEl = getSelectedBuilderNodeEl();
      const patch: CanvasStylePatch = {};
      // number → set px · null → clear · undefined → leave as-is
      if (typeof dims.width === "number") {
        patch.width = `${Math.round(dims.width)}px`;
      } else if (dims.width === null) {
        patch.width = undefined;
        if (liveEl) liveEl.style.width = "";
      }
      if (typeof dims.height === "number") {
        patch.height = `${Math.round(dims.height)}px`;
      } else if (dims.height === null) {
        patch.height = undefined;
        if (liveEl) liveEl.style.height = "";
      }
      if (dims.translate) {
        const rx = Math.round(dims.translate.x);
        const ry = Math.round(dims.translate.y);
        // 0,0 → drop the escape entirely (mirrors the translate commit).
        patch.translate = rx === 0 && ry === 0 ? undefined : `${rx}px ${ry}px`;
      }
      commit(style, patch);
    },
    [commit, currentStyle, getSelectedBuilderNodeEl],
  );

  const commitPadding = useCallback(
    (side: PaddingSide, px: number) => {
      const style = currentStyle();
      if (!style) return;
      commit(style, { [PADDING_KEY[side]]: `${Math.round(px)}px` });
    },
    [commit, currentStyle],
  );

  // #25 — box-model MARGIN drag. 0 clears the escape back to the token.
  const commitMargin = useCallback(
    (side: MarginSide, px: number) => {
      const style = currentStyle();
      if (!style) return;
      const liveEl = getSelectedBuilderNodeEl();
      if (Math.round(px) <= 0) {
        if (liveEl) liveEl.style[MARGIN_INLINE_PROP[side]] = "";
        commit(style, { [MARGIN_KEY[side]]: undefined });
        return;
      }
      commit(style, { [MARGIN_KEY[side]]: `${Math.round(px)}px` });
    },
    [commit, currentStyle, getSelectedBuilderNodeEl],
  );

  // #21 — visual auto-layout GAP drag (flex/grid containers). Writes the single
  // `gap` free escape (→ `--bn-gap`), identical to the Style panel's Gap field.
  // 0 clears it back to the gap token; the inline preview is cleared too so the
  // reset is visible immediately.
  const commitGap = useCallback(
    (px: number) => {
      const style = currentStyle();
      if (!style) return;
      const liveEl = getSelectedBuilderNodeEl();
      if (Math.round(px) <= 0) {
        if (liveEl) {
          liveEl.style.gap = "";
          liveEl.style.columnGap = "";
          liveEl.style.rowGap = "";
        }
        commit(style, { gap: undefined });
        return;
      }
      commit(style, { gap: `${Math.round(px)}px` });
    },
    [commit, currentStyle, getSelectedBuilderNodeEl],
  );

  return { commitSize, commitPadding, commitMargin, commitGap };
}
