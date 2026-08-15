/**
 * canvas-guide-snap — bridges the operator-placed ruler guides (#31) into the
 * direct-manipulation drag gestures, putting the previously DEAD
 * `findGuideSnap` utility to work.
 *
 * Guides are STORED in document-px (zoom-invariant) inside
 * CanvasViewportProvider, but the move/resize handles work purely in viewport
 * px (pointer coords + getBoundingClientRect). Rather than re-deriving the
 * doc→viewport transform (zoom × scroll × HUD insets × ruler gutter — four
 * inputs that have already drifted between the two renderers in
 * canvas-rulers-guides.tsx), we snapshot each RENDERED guide line's exact
 * viewport position from the DOM at drag start — the line the operator SEES
 * is the line the block snaps to, by construction.
 *
 * The snapshot is expressed as `CanvasGuide[]` so the nearest-line resolution
 * still goes through `findGuideSnap` (same tolerance semantics), only with
 * viewport-px positions instead of document-px ones.
 *
 * Axis vocabulary (inherited from the guide model): axis "y" = a VERTICAL
 * line (snaps x-coordinates), axis "x" = a HORIZONTAL line (snaps
 * y-coordinates).
 */

import { findGuideSnap } from "./canvas-rulers-guides";
import type { CanvasGuide } from "./canvas-viewport";

/** Active-guide blue — matches the guide lines' own drag-active colour. */
export const GUIDE_SNAP_HIGHLIGHT = "rgba(82, 130, 255, 0.95)";

export interface GuideViewportLines {
  /** Vertical guide lines (axis "y") — snap targets for X coordinates. */
  v: CanvasGuide[];
  /** Horizontal guide lines (axis "x") — snap targets for Y coordinates. */
  h: CanvasGuide[];
}

/**
 * Snapshot every rendered guide line's viewport position. Cheap (a handful of
 * fixed-position 1px elements), taken once per drag; guides cannot move while
 * the operator is dragging a block.
 */
export function collectGuideViewportLines(
  doc: Document = document,
): GuideViewportLines {
  const v: CanvasGuide[] = [];
  const h: CanvasGuide[] = [];
  const els = doc.querySelectorAll<HTMLElement>("[data-canvas-guide-axis]");
  els.forEach((el) => {
    const axis = el.getAttribute("data-canvas-guide-axis");
    const r = el.getBoundingClientRect();
    if (axis === "y") {
      v.push({ id: `vp-${v.length}`, axis: "y", positionPx: r.left });
    } else if (axis === "x") {
      h.push({ id: `vp-${h.length}`, axis: "x", positionPx: r.top });
    }
  });
  return { v, h };
}

/**
 * Snap a viewport coordinate to the nearest guide line via `findGuideSnap`.
 * Returns the (possibly unchanged) position plus the guide's coordinate when
 * a snap occurred — the caller draws the highlight line there.
 */
export function snapToGuideLines(
  pos: number,
  lines: ReadonlyArray<CanvasGuide>,
  axis: "x" | "y",
  tolerance: number,
): { pos: number; guide: number | null } {
  const snapped = findGuideSnap(pos, axis, lines, tolerance);
  return { pos: snapped, guide: snapped === pos ? null : snapped };
}
