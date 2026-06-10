"use client";

/**
 * cursor-coords.ts — WS1-B (live cursors) coordinate model.
 *
 * Remote cursors must line up across editors that have DIFFERENT zoom levels,
 * scroll positions, and window widths. Rather than broadcast raw viewport pixels
 * (which differ per editor) or do fragile zoom/transform math, we ANCHOR each
 * cursor to the builder node it sits over and broadcast its position as a FRACTION
 * of that node's box (`fx`, `fy` in 0..1). The receiver looks up the SAME node in
 * its own DOM and re-projects the fraction against that node's `getBoundingClientRect()`.
 *
 * Why this is robust: `getBoundingClientRect()` returns VISUAL (post-transform)
 * coordinates on BOTH editors, so the same node's box already bakes in each
 * editor's zoom, scroll, and centering. A fraction of that box therefore maps to
 * the same on-screen point regardless of those differences — no zoom parameter
 * needed. These helpers are pure + unit-tested; the DOM lookup lives in the layer.
 */

export interface AnchorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CursorAnchor {
  /** data-builder-node-id of the element the cursor is over. */
  nodeId: string;
  /** Fractional X within the node box (0 = left edge, 1 = right edge). Clamped sender-side is NOT applied so a slight overhang still renders. */
  fx: number;
  /** Fractional Y within the node box. */
  fy: number;
}

/** Cursor viewport point + the node it's over → a node-relative fractional anchor. */
export function cursorToAnchor(
  clientX: number,
  clientY: number,
  nodeId: string,
  rect: AnchorRect,
): CursorAnchor {
  const fx = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
  const fy = rect.height > 0 ? (clientY - rect.top) / rect.height : 0;
  return { nodeId, fx, fy };
}

/** A fractional anchor + the SAME node's box in THIS editor → a viewport point. */
export function anchorToCursor(
  anchor: Pick<CursorAnchor, "fx" | "fy">,
  rect: AnchorRect,
): { x: number; y: number } {
  return {
    x: rect.left + anchor.fx * rect.width,
    y: rect.top + anchor.fy * rect.height,
  };
}

/** Round-trip identity check helper (used by tests + a sanity guard). */
export function projectAcrossRects(
  clientX: number,
  clientY: number,
  nodeId: string,
  senderRect: AnchorRect,
  receiverRect: AnchorRect,
): { x: number; y: number } {
  const anchor = cursorToAnchor(clientX, clientY, nodeId, senderRect);
  return anchorToCursor(anchor, receiverRect);
}
