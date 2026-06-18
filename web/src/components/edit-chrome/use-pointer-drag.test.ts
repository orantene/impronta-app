import assert from "node:assert/strict";
import { test } from "node:test";

import {
  POINTER_DRAG_THRESHOLD_PX,
  pointerMovedPastThreshold,
  pointerOnUpperHalf,
  pointerDropGapIndex,
} from "./use-pointer-drag";

// CANVAS-6 — the shared pointer-drag hook's load-bearing geometry: a press only
// becomes a drag past a movement threshold (so a tap still selects), and the
// drop edge / gap index resolve from the pointer's Y over a row's box exactly as
// the old HTML5 dragover handlers computed `clientY - rect.top < rect.height/2`.

test("a press below the threshold is still a tap, not a drag", () => {
  const origin = { x: 100, y: 100 };
  // 3px right + 0px down → 3 < 5, sub-threshold.
  assert.equal(pointerMovedPastThreshold(origin, { x: 103, y: 100 }), false);
  // exactly on the diagonal that totals < 5 (3,3 → 4.24px) stays a tap.
  assert.equal(pointerMovedPastThreshold(origin, { x: 103, y: 103 }), false);
});

test("a press past the threshold engages the drag", () => {
  const origin = { x: 100, y: 100 };
  // 5px straight down → meets the 5px threshold (>=).
  assert.equal(pointerMovedPastThreshold(origin, { x: 100, y: 105 }), true);
  // 6px right → past threshold.
  assert.equal(pointerMovedPastThreshold(origin, { x: 106, y: 100 }), true);
  // diagonal (4,4 → 5.66px) past the 5px radius.
  assert.equal(pointerMovedPastThreshold(origin, { x: 104, y: 104 }), true);
});

test("the threshold is symmetric in all directions", () => {
  const origin = { x: 200, y: 200 };
  for (const [dx, dy] of [
    [POINTER_DRAG_THRESHOLD_PX, 0],
    [-POINTER_DRAG_THRESHOLD_PX, 0],
    [0, POINTER_DRAG_THRESHOLD_PX],
    [0, -POINTER_DRAG_THRESHOLD_PX],
  ] as const) {
    assert.equal(
      pointerMovedPastThreshold(origin, {
        x: origin.x + dx,
        y: origin.y + dy,
      }),
      true,
      `move (${dx},${dy}) should engage at the threshold`,
    );
  }
});

test("a custom threshold is respected", () => {
  const origin = { x: 0, y: 0 };
  // 8px move with a 10px threshold stays a tap; with the default 5px it drags.
  assert.equal(pointerMovedPastThreshold(origin, { x: 8, y: 0 }, 10), false);
  assert.equal(pointerMovedPastThreshold(origin, { x: 8, y: 0 }), true);
});

test("pointerOnUpperHalf splits a row's box at its vertical midpoint", () => {
  const rect = { top: 100, height: 40 }; // midpoint at y=120
  // Above the midpoint → upper half (drop BEFORE).
  assert.equal(pointerOnUpperHalf(110, rect), true);
  // Exactly at the midpoint → NOT upper (the `< height/2` boundary lands lower).
  assert.equal(pointerOnUpperHalf(120, rect), false);
  // Below the midpoint → lower half (drop AFTER).
  assert.equal(pointerOnUpperHalf(135, rect), false);
});

test("pointerOnUpperHalf is scroll-position independent (uses top-relative Y)", () => {
  // Same row, scrolled so its box top is at 500; a pointer 5px into the row is
  // still on the upper half regardless of absolute coordinates.
  const rect = { top: 500, height: 40 };
  assert.equal(pointerOnUpperHalf(505, rect), true);
  assert.equal(pointerOnUpperHalf(539, rect), false);
});

test("pointerDropGapIndex maps the upper half before and the lower half after", () => {
  // Hovering row index 2: upper half → insert before it (gap 2), lower half →
  // insert after it (gap 3). This is the gap convention siblingDropGapToMoveIndex
  // consumes downstream in every drag site.
  assert.equal(pointerDropGapIndex(2, true), 2);
  assert.equal(pointerDropGapIndex(2, false), 3);
  // First row, upper half → top of the list.
  assert.equal(pointerDropGapIndex(0, true), 0);
  // First row, lower half → between row 0 and row 1.
  assert.equal(pointerDropGapIndex(0, false), 1);
});

test("end-to-end: a downward drag onto a lower row resolves to an after-gap", () => {
  // Press the row at top=100 (its grip), move down 30px onto the next row whose
  // box is top=140,height=40. The pointer lands at y=175 → lower half → after.
  const origin = { x: 50, y: 110 };
  const moved = { x: 50, y: 175 };
  assert.equal(pointerMovedPastThreshold(origin, moved), true);
  const targetRect = { top: 140, height: 40 }; // midpoint 160
  const upper = pointerOnUpperHalf(moved.y, targetRect);
  assert.equal(upper, false); // 175 >= 160 → lower half
  // Target row is index 3 → drop AFTER it → gap 4.
  assert.equal(pointerDropGapIndex(3, upper), 4);
});
