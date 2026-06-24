import { test } from "node:test";
import assert from "node:assert/strict";

import { computeAnchoredPosition } from "./use-anchored-popover";

/**
 * Locks the placement math that keeps portaled inspector popovers (AI rewrite /
 * translate, the NumberUnit listbox) on-screen instead of clipped by the
 * inspector dock's overflow scroll container. Pure function — no DOM.
 */

const VW = 1000;
const VH = 800;
const base = { width: 200, gap: 4, popHeight: 100, viewportWidth: VW, viewportHeight: VH };

test("left-align anchors below the trigger at its left edge", () => {
  const pos = computeAnchoredPosition(
    { top: 100, bottom: 120, left: 300, right: 360 },
    { ...base, align: "left" },
  );
  assert.equal(pos.left, 300);
  assert.equal(pos.top, 124); // bottom + gap
});

test("right-align aligns the popover's right edge to the trigger's right edge", () => {
  const pos = computeAnchoredPosition(
    { top: 100, bottom: 120, left: 300, right: 360 },
    { ...base, align: "right" }, // left = 360 - 200
  );
  assert.equal(pos.left, 160);
});

test("clamps to the left viewport edge (min 8px)", () => {
  const pos = computeAnchoredPosition(
    { top: 50, bottom: 70, left: 2, right: 40 },
    { ...base, align: "left" },
  );
  assert.equal(pos.left, 8);
});

test("clamps to the right viewport edge (vw - width - 8)", () => {
  const pos = computeAnchoredPosition(
    { top: 50, bottom: 70, left: 950, right: 990 },
    { ...base, align: "left" },
  );
  assert.equal(pos.left, VW - base.width - 8); // 792
});

test("flips above the trigger when it would overflow the bottom edge", () => {
  const pos = computeAnchoredPosition(
    { top: 700, bottom: 740, left: 300, right: 360 },
    { ...base, align: "left", popHeight: 300 }, // 740+4+300=1044 > 800-8
  );
  // flipped: rect.top - popHeight - gap = 700 - 300 - 4
  assert.equal(pos.top, 396);
});

test("does NOT flip while popHeight is unknown (0 = not yet measured)", () => {
  const pos = computeAnchoredPosition(
    { top: 700, bottom: 740, left: 300, right: 360 },
    { ...base, align: "left", popHeight: 0 },
  );
  assert.equal(pos.top, 744); // stays below
});

test("flip is itself clamped to a minimum top of 8px", () => {
  const pos = computeAnchoredPosition(
    { top: 20, bottom: 790, left: 300, right: 360 },
    { ...base, align: "left", popHeight: 400 }, // overflows bottom → flip
  );
  // rect.top - popHeight - gap = 20 - 400 - 4 = -384 → clamped to 8
  assert.equal(pos.top, 8);
});
