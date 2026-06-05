/**
 * 4A #8 — pure geometry for canvas alignment + equal-spacing (distribution)
 * guides shown while a freeform block is dragged or resized.
 *
 * Premium builders (Figma / Webflow / Framer) draw two kinds of hint:
 *   • ALIGNMENT — the dragged edge/centre lines up with a sibling or the
 *     parent edge/centre (magenta line). The move handle already does this for
 *     translate; this module adds the reusable edge-coordinate gatherer so the
 *     resize handle can light the same lines.
 *   • EQUAL SPACING — the gap between the dragged block and its nearest sibling
 *     on one side equals the gap to the nearest sibling on the other side
 *     (teal gap pills). This is the "distribute evenly" cue.
 *
 * Kept DOM-free + side-effect-free so the placement maths can be unit-tested
 * without a browser — same split as `canvas-node-drop.ts`. The selection-layer
 * components feed it live `getBoundingClientRect()` boxes.
 */

export interface GuideBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A matched equal-gap pair on one axis, in viewport coordinates. */
export interface SpacingGuide {
  axis: "x" | "y";
  /** The equal gap length (px). */
  gap: number;
  /** Cross-axis coordinate the gap pills are centred on (px). */
  cross: number;
  /** The two equal gap bands (start→end on the active axis, px). */
  bands: ReadonlyArray<{ from: number; to: number }>;
}

function startOf(box: GuideBox, axis: "x" | "y"): number {
  return axis === "x" ? box.left : box.top;
}
function endOf(box: GuideBox, axis: "x" | "y"): number {
  return axis === "x" ? box.left + box.width : box.top + box.height;
}
function crossCentreOf(box: GuideBox, axis: "x" | "y"): number {
  return axis === "x"
    ? box.top + box.height / 2 // x-axis gaps draw on the vertical centre
    : box.left + box.width / 2; // y-axis gaps draw on the horizontal centre
}

/**
 * On one axis, the nearest sibling that sits entirely BEFORE the dragged box
 * and the nearest one entirely AFTER, with their gap lengths. Only siblings
 * that overlap the dragged box on the CROSS axis count, so a block in a
 * different row/column never produces a spurious gap. Returns null when there
 * isn't a clean before+after pair (both sides must exist).
 */
function nearestGapPair(
  dragged: GuideBox,
  siblings: ReadonlyArray<GuideBox>,
  axis: "x" | "y",
): {
  beforeGap: number;
  beforeEnd: number;
  afterGap: number;
  afterStart: number;
} | null {
  const cross: "x" | "y" = axis === "x" ? "y" : "x";
  const overlapsCross = (sib: GuideBox): boolean => {
    const a0 = startOf(dragged, cross);
    const a1 = endOf(dragged, cross);
    const b0 = startOf(sib, cross);
    const b1 = endOf(sib, cross);
    return Math.min(a1, b1) - Math.max(a0, b0) > 0;
  };
  const dStart = startOf(dragged, axis);
  const dEnd = endOf(dragged, axis);

  let beforeGap: number | null = null;
  let beforeEnd = 0;
  let afterGap: number | null = null;
  let afterStart = 0;
  for (const sib of siblings) {
    if (!overlapsCross(sib)) continue;
    const sEnd = endOf(sib, axis);
    const sStart = startOf(sib, axis);
    if (sEnd <= dStart) {
      const gap = dStart - sEnd;
      if (beforeGap === null || gap < beforeGap) {
        beforeGap = gap;
        beforeEnd = sEnd;
      }
    } else if (sStart >= dEnd) {
      const gap = sStart - dEnd;
      if (afterGap === null || gap < afterGap) {
        afterGap = gap;
        afterStart = sStart;
      }
    }
  }
  if (beforeGap === null || afterGap === null) return null;
  if (beforeGap < 0 || afterGap < 0) return null;
  return { beforeGap, beforeEnd, afterGap, afterStart };
}

/**
 * On one axis, an equal-spacing (distribution) match: the dragged box's gap to
 * its nearest sibling on each side is equal within `tol`. Used to DRAW the teal
 * gap pills. Returns null when there isn't a clean before+after pair or the two
 * gaps differ by more than `tol`.
 */
export function findEqualSpacing(input: {
  dragged: GuideBox;
  siblings: ReadonlyArray<GuideBox>;
  axis: "x" | "y";
  tol: number;
}): SpacingGuide | null {
  const { dragged, siblings, axis, tol } = input;
  const pair = nearestGapPair(dragged, siblings, axis);
  if (!pair) return null;
  if (Math.abs(pair.beforeGap - pair.afterGap) > tol) return null;

  const dStart = startOf(dragged, axis);
  const dEnd = endOf(dragged, axis);
  const gap = (pair.beforeGap + pair.afterGap) / 2;
  return {
    axis,
    gap,
    cross: crossCentreOf(dragged, axis),
    bands: [
      { from: pair.beforeEnd, to: dStart },
      { from: dEnd, to: pair.afterStart },
    ],
  };
}

/**
 * The translate (on the given axis) that makes the dragged box's before/after
 * gaps EXACTLY equal, when the current position is within `tol` of balanced.
 * Softly snaps the move to the equal-spacing position. Unlike `findEqualSpacing`
 * (which only fires once the gaps are already near-equal so the PILLS appear),
 * this gates on the SHIFT being small enough to feel like a soft pull, so it
 * engages slightly before the pills do. Returns null when no clean pair exists
 * or the balancing shift exceeds `tol`.
 */
export function equalSpacingSnapDelta(input: {
  dragged: GuideBox;
  siblings: ReadonlyArray<GuideBox>;
  axis: "x" | "y";
  tol: number;
}): number | null {
  const pair = nearestGapPair(input.dragged, input.siblings, input.axis);
  if (!pair) return null;
  // Half the gap difference is the shift that equalises them. (Positive = move
  // toward the larger "after" gap side.)
  const delta = (pair.afterGap - pair.beforeGap) / 2;
  if (Math.abs(delta) > input.tol) return null;
  return delta;
}
