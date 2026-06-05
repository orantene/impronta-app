import assert from "node:assert/strict";
import { test } from "node:test";

import {
  findEqualSpacing,
  equalSpacingSnapDelta,
  type GuideBox,
} from "./canvas-align-guides";

// Three boxes in a horizontal row, each 40 wide / 40 tall on the same y band.
// left sibling: x 0–40 · dragged: x 60–100 · right sibling: x 120–160
// → before gap = 60−40 = 20 ; after gap = 120−100 = 20  → EQUAL.
const leftSib: GuideBox = { left: 0, top: 0, width: 40, height: 40 };
const rightSib: GuideBox = { left: 120, top: 0, width: 40, height: 40 };

test("equal horizontal gaps between the nearest before/after siblings match", () => {
  const dragged: GuideBox = { left: 60, top: 0, width: 40, height: 40 };
  const match = findEqualSpacing({
    dragged,
    siblings: [leftSib, rightSib],
    axis: "x",
    tol: 2,
  });
  assert.ok(match);
  assert.equal(match.axis, "x");
  assert.equal(match.gap, 20);
  assert.equal(match.bands.length, 2);
  assert.deepEqual(match.bands[0], { from: 40, to: 60 }); // after left sibling
  assert.deepEqual(match.bands[1], { from: 100, to: 120 }); // before right sibling
});

test("unequal gaps outside tolerance do not match", () => {
  // dragged shifted right: before gap 30, after gap 10 → diff 20 > tol.
  const dragged: GuideBox = { left: 70, top: 0, width: 40, height: 40 };
  const match = findEqualSpacing({
    dragged,
    siblings: [leftSib, rightSib],
    axis: "x",
    tol: 2,
  });
  assert.equal(match, null);
});

test("a sibling in a different cross-band is ignored (no spurious gap)", () => {
  // right sibling moved far down so it no longer overlaps the dragged y band.
  const farRow: GuideBox = { left: 120, top: 500, width: 40, height: 40 };
  const dragged: GuideBox = { left: 60, top: 0, width: 40, height: 40 };
  const match = findEqualSpacing({
    dragged,
    siblings: [leftSib, farRow],
    axis: "x",
    tol: 2,
  });
  // only a before sibling overlaps → no clean before+after pair.
  assert.equal(match, null);
});

test("snap delta equalises near-balanced gaps and is zero when already equal", () => {
  const balanced: GuideBox = { left: 60, top: 0, width: 40, height: 40 };
  assert.equal(
    equalSpacingSnapDelta({
      dragged: balanced,
      siblings: [leftSib, rightSib],
      axis: "x",
      tol: 6,
    }),
    0,
  );
  // off by 4px (before 24 / after 16): delta = (16−24)/2 = −4, within tol 6.
  const off: GuideBox = { left: 64, top: 0, width: 40, height: 40 };
  assert.equal(
    equalSpacingSnapDelta({
      dragged: off,
      siblings: [leftSib, rightSib],
      axis: "x",
      tol: 6,
    }),
    -4,
  );
  // off by 12px is beyond tol → no snap.
  const farOff: GuideBox = { left: 72, top: 0, width: 40, height: 40 };
  assert.equal(
    equalSpacingSnapDelta({
      dragged: farOff,
      siblings: [leftSib, rightSib],
      axis: "x",
      tol: 6,
    }),
    null,
  );
});

test("vertical-axis equal spacing works symmetrically", () => {
  const topSib: GuideBox = { left: 0, top: 0, width: 40, height: 40 };
  const botSib: GuideBox = { left: 0, top: 120, width: 40, height: 40 };
  const dragged: GuideBox = { left: 0, top: 60, width: 40, height: 40 };
  const match = findEqualSpacing({
    dragged,
    siblings: [topSib, botSib],
    axis: "y",
    tol: 2,
  });
  assert.ok(match);
  assert.equal(match.axis, "y");
  assert.equal(match.gap, 20);
});
