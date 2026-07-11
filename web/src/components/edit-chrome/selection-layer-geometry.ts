/**
 * selection-layer-geometry — pure math extracted from the canvas overlay
 * (`selection-layer.tsx`). Every function here is a pure transform over plain
 * numbers / snapshotted rects with NO DOM or React access, so the drag /
 * marquee / autoscroll choreography can be unit-tested in isolation and the
 * component keeps only the effect wiring.
 *
 * The DOM-touching callers in selection-layer.tsx snapshot element boxes into
 * these plain shapes (via getBoundingClientRect) and inject any DOM predicate
 * (element containment, slot-type compatibility) as a function argument, which
 * is what keeps the resolvers pure.
 */

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** px before an armed section drag actually begins. */
export const DRAG_THRESHOLD = 4;
/** px edge band that triggers auto-scroll. */
export const AUTOSCROLL_BAND = 80;
/** px per frame at the very viewport edge. */
export const AUTOSCROLL_MAX = 14;

/**
 * A section snapshotted for the reorder drop calculation: its slot + order and
 * the viewport rect edges captured at drag-start (refreshed on scroll/resize).
 */
export interface SectionDropItem {
  id: string;
  slotKey: string;
  order: number;
  top: number;
  bottom: number;
  left: number;
  width: number;
}

/** The resolved drop target for a section reorder gesture. */
export interface SectionDropTarget {
  slotKey: string;
  /** Index in the slot's section list the source will end at AFTER the move. */
  sortOrder: number;
  /** True when the cursor is over a slot that accepts the source section type. */
  allowed: boolean;
  /** Screen-space y where the drop indicator line is drawn. */
  indicatorY: number;
  indicatorLeft: number;
  indicatorWidth: number;
}

/**
 * Pure section-reorder drop resolver. Finds the section whose vertical midpoint
 * is closest to the cursor; cursor in its top half → insert before, bottom half
 * → insert after. Cross-slot drops defer the allow/deny decision to the injected
 * `isCrossSlotAllowed` predicate (same slot as the source is always allowed).
 *
 * Byte-for-byte the same decision the per-frame DOM scan produced — the midpoint
 * math is pure over `items`.
 */
export function resolveSectionDropTarget(
  items: readonly SectionDropItem[],
  cursorY: number,
  sourceSlot: string | null,
  isCrossSlotAllowed: (targetSlotKey: string) => boolean,
): SectionDropTarget | null {
  if (items.length === 0) return null;
  let best: SectionDropItem | null = null;
  let bestDist = Infinity;
  for (const it of items) {
    const mid = (it.top + it.bottom) / 2;
    const d = Math.abs(cursorY - mid);
    if (d < bestDist) {
      bestDist = d;
      best = it;
    }
  }
  if (!best) return null;
  const mid = (best.top + best.bottom) / 2;
  const insertBefore = cursorY < mid;
  const targetSlot = best.slotKey;
  const siblings = items.filter((it) => it.slotKey === targetSlot);
  const bestSibIdx = siblings.findIndex((s) => s.id === best!.id);
  const sortOrder = insertBefore ? bestSibIdx : bestSibIdx + 1;
  const allowed =
    sourceSlot === targetSlot ? true : isCrossSlotAllowed(targetSlot);
  const indicatorY = insertBefore ? best.top : best.bottom;
  return {
    slotKey: targetSlot,
    sortOrder,
    allowed,
    indicatorY,
    indicatorLeft: best.left,
    indicatorWidth: best.width,
  };
}

/**
 * Pure autoscroll velocity ramp. Returns the px-per-frame the window should
 * scroll given the cursor's viewport-y: 0 outside the edge band, ramping
 * linearly to ±`max` at the very edge. Negative = scroll up.
 */
export function autoscrollDeltaForY(
  y: number,
  viewportHeight: number,
  band: number = AUTOSCROLL_BAND,
  max: number = AUTOSCROLL_MAX,
): number {
  if (y < band) {
    return -((band - y) / band) * max;
  }
  if (y > viewportHeight - band) {
    return ((y - (viewportHeight - band)) / band) * max;
  }
  return 0;
}

/** Axis-aligned rect intersection test (overlap, edges exclusive). */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.left < b.left + b.width &&
    a.left + a.width > b.left &&
    a.top < b.top + b.height &&
    a.top + a.height > b.top
  );
}

/**
 * The marquee selection rect from its start + end drag points (viewport px).
 */
export function marqueeRectFromPoints(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): Rect {
  return {
    left: Math.min(startX, endX),
    top: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  };
}

/**
 * Pure marquee hit-test + containment filter. Keeps every candidate whose box
 * intersects the marquee rect, then drops any hit that is an ANCESTOR of another
 * hit — only the innermost (deepest) node in a nested match is selected, matching
 * the original DOM behaviour. Element containment is injected as
 * `contains(ancestor, descendant)` so this stays DOM-free.
 */
export function filterMarqueeHits<T extends { box: Rect }>(
  rect: Rect,
  candidates: readonly T[],
  contains: (ancestor: T, descendant: T) => boolean,
): T[] {
  const hits = candidates.filter((candidate) =>
    rectsIntersect(rect, candidate.box),
  );
  return hits.filter(
    (candidate) =>
      !hits.some((other) => other !== candidate && contains(candidate, other)),
  );
}
