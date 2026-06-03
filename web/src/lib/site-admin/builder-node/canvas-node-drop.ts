/**
 * P3-DRAG (T3.1–T3.2) — canvas drop-point → { parent, index } resolver.
 *
 * Two new direct-manipulation gestures route through this:
 *   1. drag a NEW element from the palette and drop it at an arbitrary canvas
 *      position into the correct parent container (insert);
 *   2. drag an EXISTING canvas block to reorder / re-nest it (move).
 *
 * Both need the same geometry math: given the cursor point and the live DOM
 * boxes of the rendered builder nodes, decide WHICH container the element lands
 * in and AT WHICH index among that container's direct children. The DOM walk
 * lives in `selection-layer.tsx`; this module is the pure, unit-testable core
 * so the placement math can be proven without a browser.
 *
 * Mirrors the section-level `computeDrop` in selection-layer.tsx (closest
 * cursor-vs-midpoint rule) and the gap→index convention used by
 * `sibling-drop-gap.ts`. The returned `index` is the FINAL child index in the
 * container's child list (gap index 0…childCount). For an EXISTING-node move
 * inside the same parent, callers must still feed the gap through
 * `siblingDropGapToMoveIndex` to apply the post-removal −1 adjustment.
 */

import { canDropBuilderNode } from "./drop-policy";
import type { BuilderNodeKind } from "./types";

/** One drop-candidate container the cursor may land inside, with its geometry. */
export interface CanvasDropCandidate {
  /** Builder-node id of the container element. */
  nodeId: string;
  /** Container's own kind (used for the child-kind allow-list check). */
  kind: BuilderNodeKind;
  /** Viewport rect of the container element. */
  rect: { top: number; left: number; width: number; height: number };
  /**
   * Nesting depth (number of ancestor candidates that contain this one).
   * Deeper = more specific; used to pick the innermost legal container the
   * cursor is over.
   */
  depth: number;
  /** True when this container is curated/role-locked and cannot accept drops. */
  locked: boolean;
  /**
   * Direct child rows of this container, in order. Each carries the child's
   * own node id and the vertical band it occupies (top/bottom of its rect).
   * Children that are NOT also drop candidates still appear here so the index
   * math sees every sibling. The dragged node (for a move) is included; the
   * caller filters by `excludeNodeId`.
   */
  children: ReadonlyArray<{ nodeId: string; top: number; bottom: number }>;
}

export interface CanvasDropResult {
  /** Container the element will land inside. */
  parentNodeId: string;
  /** The resolved parent container's own kind (drives the reparent label). */
  parentKind: BuilderNodeKind;
  /**
   * Viewport rect of the resolved parent container. Lets the canvas chrome
   * outline the would-be parent (drop-target highlight + reparent/nesting
   * preview) without re-walking the DOM. Mirrors the candidate's `rect`.
   */
  parentRect: { top: number; left: number; width: number; height: number };
  /** Gap index among the parent's direct children (0…childCount). */
  index: number;
  /** True when the dragged kind is allowed under this parent. */
  allowed: boolean;
  /** Screen-space y for the drop indicator line. */
  indicatorY: number;
  indicatorLeft: number;
  indicatorWidth: number;
}

function pointInRect(
  x: number,
  y: number,
  rect: { top: number; left: number; width: number; height: number },
): boolean {
  return (
    x >= rect.left &&
    x <= rect.left + rect.width &&
    y >= rect.top &&
    y <= rect.top + rect.height
  );
}

/**
 * Resolve the drop target for a canvas drag.
 *
 * @param cursorX/cursorY  viewport cursor point
 * @param draggedKind      the kind being inserted/moved (drives the allow-list)
 * @param candidates       every container the cursor could land inside
 * @param excludeNodeId    for an existing-node move: the node being dragged
 *                         (excluded as a parent AND from sibling index math so
 *                         you can't drop a node into itself or count it twice)
 */
export function resolveCanvasNodeDrop(input: {
  cursorX: number;
  cursorY: number;
  draggedKind: BuilderNodeKind;
  candidates: ReadonlyArray<CanvasDropCandidate>;
  excludeNodeId?: string | null;
}): CanvasDropResult | null {
  const { cursorX, cursorY, draggedKind, candidates, excludeNodeId } = input;

  // Innermost container under the cursor wins: filter to the ones the point is
  // inside, then take the deepest. Locked containers and the dragged node (and
  // any of its descendants) are not valid parents.
  const hits = candidates.filter((candidate) => {
    if (candidate.locked) return false;
    if (excludeNodeId && candidate.nodeId === excludeNodeId) return false;
    return pointInRect(cursorX, cursorY, candidate.rect);
  });
  if (hits.length === 0) return null;
  let parent = hits[0]!;
  for (const candidate of hits) {
    if (candidate.depth > parent.depth) parent = candidate;
  }

  // Index among the parent's direct children: cursor above a child's midpoint
  // → insert before it; below the last midpoint → append. The dragged node is
  // excluded so a same-parent move measures against the OTHER siblings only.
  const siblings = parent.children.filter(
    (child) => !excludeNodeId || child.nodeId !== excludeNodeId,
  );

  let index = siblings.length;
  let indicatorY = parent.rect.top + parent.rect.height;
  for (let i = 0; i < siblings.length; i += 1) {
    const child = siblings[i]!;
    const mid = (child.top + child.bottom) / 2;
    if (cursorY < mid) {
      index = i;
      indicatorY = child.top;
      break;
    }
    // Cursor is below this child's midpoint — tentatively land after it; a
    // later child may still claim the cursor on its next iteration.
    index = i + 1;
    indicatorY = child.bottom;
  }

  const allowed = canDropBuilderNode({
    nodeKind: draggedKind,
    parentKind: parent.kind,
  }).ok;

  return {
    parentNodeId: parent.nodeId,
    parentKind: parent.kind,
    parentRect: {
      top: parent.rect.top,
      left: parent.rect.left,
      width: parent.rect.width,
      height: parent.rect.height,
    },
    index,
    allowed,
    indicatorY,
    indicatorLeft: parent.rect.left,
    indicatorWidth: parent.rect.width,
  };
}
