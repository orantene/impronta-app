/**
 * Unit tests for the panel drag auto-scroll ramp + the three-way drop-zone
 * split. Both are pure number math, so they are exercised here directly rather
 * than through the hook (which owns only rAF/DOM wiring).
 *
 * Run: node_modules/.bin/tsx --test \
 *   src/components/edit-chrome/pointer-drag-autoscroll.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  NEST_EDGE_BAND_RATIO,
  PANEL_AUTOSCROLL_BAND,
  PANEL_AUTOSCROLL_MAX,
  panelScrollDeltaForY,
  pointerDropZone,
} from "./pointer-drag-autoscroll";

const RECT = { top: 100, bottom: 500 };

test("the calm middle of a scroll container produces no scroll", () => {
  assert.equal(panelScrollDeltaForY(300, RECT), 0);
  // Just inside each band boundary is still calm.
  assert.equal(panelScrollDeltaForY(100 + PANEL_AUTOSCROLL_BAND, RECT), 0);
  assert.equal(panelScrollDeltaForY(500 - PANEL_AUTOSCROLL_BAND, RECT), 0);
});

test("the top band scrolls up and the bottom band scrolls down", () => {
  assert.ok(panelScrollDeltaForY(110, RECT) < 0, "near the top edge scrolls up");
  assert.ok(panelScrollDeltaForY(490, RECT) > 0, "near the bottom edge scrolls down");
});

test("the ramp is linear and reaches max at the container edge", () => {
  assert.equal(panelScrollDeltaForY(RECT.top, RECT), -PANEL_AUTOSCROLL_MAX);
  assert.equal(panelScrollDeltaForY(RECT.bottom, RECT), PANEL_AUTOSCROLL_MAX);
  // Halfway into the band → half speed.
  const half = panelScrollDeltaForY(RECT.top + PANEL_AUTOSCROLL_BAND / 2, RECT);
  assert.ok(Math.abs(half + PANEL_AUTOSCROLL_MAX / 2) < 1e-9);
});

test("dragging PAST the container edge keeps scrolling at full speed", () => {
  // The regression this guards: a ramp that measured raw distance without
  // clamping would invert past the edge (and a naive `return 0` outside the
  // rect would stall the list exactly when the operator has dragged furthest).
  assert.equal(panelScrollDeltaForY(RECT.top - 200, RECT), -PANEL_AUTOSCROLL_MAX);
  assert.equal(panelScrollDeltaForY(RECT.bottom + 200, RECT), PANEL_AUTOSCROLL_MAX);
});

test("a zero band never divides by zero", () => {
  assert.equal(panelScrollDeltaForY(100, RECT, 0), 0);
});

const ROW = { top: 0, height: 100 };

test("a non-nestable row keeps the original upper/lower half split", () => {
  assert.equal(pointerDropZone(10, ROW, false), "before");
  assert.equal(pointerDropZone(49, ROW, false), "before");
  assert.equal(pointerDropZone(50, ROW, false), "after");
  assert.equal(pointerDropZone(90, ROW, false), "after");
  // No y over a non-nestable row may ever resolve to "inside".
  for (let y = 0; y <= 100; y += 1) {
    assert.notEqual(pointerDropZone(y, ROW, false), "inside");
  }
});

test("a nestable row splits into before / inside / after", () => {
  const edge = ROW.height * NEST_EDGE_BAND_RATIO;
  assert.equal(pointerDropZone(edge - 1, ROW, true), "before");
  assert.equal(pointerDropZone(ROW.height / 2, ROW, true), "inside");
  assert.equal(pointerDropZone(ROW.height - edge + 1, ROW, true), "after");
});

test("the nest band is the largest of the three targets", () => {
  const width: Record<string, number> = { before: 0, inside: 0, after: 0 };
  for (let y = 0; y < ROW.height; y += 1) {
    width[pointerDropZone(y, ROW, true)] += 1;
  }
  assert.ok(
    width.inside > width.before && width.inside > width.after,
    `bands were ${JSON.stringify(width)}; the nest band should be the biggest ` +
      `so the hardest gesture is the easiest to hit`,
  );
  // …and the two sibling bands stay symmetric, so before/after feel identical.
  assert.equal(width.before, width.after);
});
