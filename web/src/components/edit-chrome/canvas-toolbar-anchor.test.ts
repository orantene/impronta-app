/**
 * canvas-toolbar-anchor.test.ts — unit tests for the pure placement math that
 * anchors the contextual selection toolbar(s) to the selection bbox
 * (canvas-toolbar-anchor.ts): above/below flip, the inside fallback for
 * viewport-filling elements, horizontal clamping against viewport edges and
 * chrome occluders, multi-bar stacking, popup direction, and the rotated-box
 * (AABB) case.
 *
 * Run: node_modules/.bin/tsx --test \
 *   src/components/edit-chrome/canvas-toolbar-anchor.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ANCHOR_GAP,
  ANCHOR_OCCLUDER_GAP,
  ANCHOR_STACK_GAP,
  ANCHOR_TOP_INSET,
  ANCHOR_VIEWPORT_MARGIN,
  clampAnchoredBarLeft,
  menuShouldOpenUp,
  resolveAnchoredToolbarStack,
  type AnchorOccluder,
} from "./canvas-toolbar-anchor";

const VIEWPORT = { width: 1280, height: 800 };
const BAR = { width: 420, height: 42 };

test("anchors ABOVE the box when there is room", () => {
  const box = { top: 400, left: 300, width: 400, height: 120 };
  const result = resolveAnchoredToolbarStack({
    box,
    bars: [BAR],
    viewport: VIEWPORT,
  });
  assert.equal(result.placement, "above");
  // Bar bottom sits exactly ANCHOR_GAP above the box top.
  assert.equal(result.bars[0].top, box.top - ANCHOR_GAP - BAR.height);
  // Centred on the box.
  assert.equal(
    result.bars[0].left,
    Math.round(box.left + box.width / 2 - BAR.width / 2),
  );
});

test("flips BELOW when the box is too close to the topbar", () => {
  const box = { top: ANCHOR_TOP_INSET + 20, left: 300, width: 400, height: 120 };
  const result = resolveAnchoredToolbarStack({
    box,
    bars: [BAR],
    viewport: VIEWPORT,
  });
  assert.equal(result.placement, "below");
  assert.equal(result.bars[0].top, box.top + box.height + ANCHOR_GAP);
});

test("falls INSIDE (pinned to the visible top edge) when the box fills the viewport", () => {
  const box = { top: -400, left: 100, width: 900, height: 2000 };
  const result = resolveAnchoredToolbarStack({
    box,
    bars: [BAR],
    viewport: VIEWPORT,
  });
  assert.equal(result.placement, "inside");
  // Visible top edge is under the topbar, so the bar pins at the inset + gap
  // band — never above ANCHOR_TOP_INSET.
  assert.ok(result.bars[0].top >= ANCHOR_TOP_INSET);
  assert.ok(result.bars[0].top <= ANCHOR_TOP_INSET + ANCHOR_GAP);
});

test("prefers the edge with room: box hanging off the top still gets BELOW when its bottom is visible", () => {
  const box = { top: -600, left: 300, width: 400, height: 900 };
  const result = resolveAnchoredToolbarStack({
    box,
    bars: [BAR],
    viewport: VIEWPORT,
  });
  assert.equal(result.placement, "below");
  assert.equal(result.bars[0].top, 300 + ANCHOR_GAP);
});

test("a box scrolled fully off-screen parks the bar at the nearest viewport edge", () => {
  const above = resolveAnchoredToolbarStack({
    box: { top: -900, left: 300, width: 400, height: 500 },
    bars: [BAR],
    viewport: VIEWPORT,
  });
  assert.ok(above.bars[0].top >= ANCHOR_TOP_INSET);

  const below = resolveAnchoredToolbarStack({
    box: { top: 1400, left: 300, width: 400, height: 500 },
    bars: [BAR],
    viewport: VIEWPORT,
  });
  assert.ok(
    below.bars[0].top + BAR.height <= VIEWPORT.height - ANCHOR_VIEWPORT_MARGIN,
  );
});

test("horizontal clamp keeps the bar inside the viewport on both sides", () => {
  const nearLeft = resolveAnchoredToolbarStack({
    box: { top: 400, left: -100, width: 120, height: 80 },
    bars: [BAR],
    viewport: VIEWPORT,
  });
  assert.equal(nearLeft.bars[0].left, ANCHOR_VIEWPORT_MARGIN);

  const nearRight = resolveAnchoredToolbarStack({
    box: { top: 400, left: 1200, width: 200, height: 80 },
    bars: [BAR],
    viewport: VIEWPORT,
  });
  assert.equal(
    nearRight.bars[0].left,
    VIEWPORT.width - ANCHOR_VIEWPORT_MARGIN - BAR.width,
  );
});

test("a right-half occluder (inspector dock) pushes the bar left of it", () => {
  const dock: AnchorOccluder = { left: 880, top: 70, right: 1264, bottom: 780 };
  const box = { top: 400, left: 700, width: 500, height: 120 };
  const result = resolveAnchoredToolbarStack({
    box,
    bars: [BAR],
    viewport: VIEWPORT,
    occluders: [dock],
  });
  assert.equal(
    result.bars[0].left,
    dock.left - ANCHOR_OCCLUDER_GAP - BAR.width,
  );
});

test("a left-half occluder (command dock) pushes the bar right of it", () => {
  const dockRail: AnchorOccluder = { left: 16, top: 76, right: 104, bottom: 700 };
  const box = { top: 400, left: 0, width: 200, height: 120 };
  const result = resolveAnchoredToolbarStack({
    box,
    bars: [BAR],
    viewport: VIEWPORT,
    occluders: [dockRail],
  });
  assert.equal(result.bars[0].left, dockRail.right + ANCHOR_OCCLUDER_GAP);
});

test("occluders outside the bar's vertical band are ignored", () => {
  // Zoom bar hugs the bottom; a bar anchored at mid-viewport ignores it.
  const zoomBar: AnchorOccluder = { left: 0, top: 688, right: 232, bottom: 730 };
  const box = { top: 400, left: 0, width: 200, height: 80 };
  const result = resolveAnchoredToolbarStack({
    box,
    bars: [BAR],
    viewport: VIEWPORT,
    occluders: [zoomBar],
  });
  assert.equal(result.bars[0].left, ANCHOR_VIEWPORT_MARGIN);
});

test("squeezed between chrome on both sides, the viewport-only clamp wins", () => {
  const left = clampAnchoredBarLeft({
    idealLeft: 430,
    width: BAR.width,
    band: { top: 400, bottom: 442 },
    viewportWidth: 900,
    occluders: [
      { left: 0, top: 0, right: 300, bottom: 800 },
      { left: 500, top: 0, right: 900, bottom: 800 },
    ],
  });
  // No legal slot clears both panels — fall back to the plain viewport clamp
  // instead of pushing the bar off-screen.
  assert.ok(left >= ANCHOR_VIEWPORT_MARGIN);
  assert.ok(left + BAR.width <= 900 - ANCHOR_VIEWPORT_MARGIN);
});

test("two bars stack: bars[0] nearest the box, above and below", () => {
  const second = { width: 300, height: 32 };
  const boxMid = { top: 400, left: 300, width: 400, height: 120 };
  const above = resolveAnchoredToolbarStack({
    box: boxMid,
    bars: [BAR, second],
    viewport: VIEWPORT,
  });
  assert.equal(above.placement, "above");
  assert.equal(above.bars[0].top, boxMid.top - ANCHOR_GAP - BAR.height);
  assert.equal(
    above.bars[1].top,
    above.bars[0].top - ANCHOR_STACK_GAP - second.height,
  );

  const boxTop = { top: ANCHOR_TOP_INSET + 10, left: 300, width: 400, height: 120 };
  const below = resolveAnchoredToolbarStack({
    box: boxTop,
    bars: [BAR, second],
    viewport: VIEWPORT,
  });
  assert.equal(below.placement, "below");
  assert.equal(below.bars[0].top, boxTop.top + boxTop.height + ANCHOR_GAP);
  assert.equal(
    below.bars[1].top,
    below.bars[0].top + BAR.height + ANCHOR_STACK_GAP,
  );
});

test("rotated-box case: anchors off the rotated AABB, clear of every corner", () => {
  // A 100×100 block centred at (500, 400) rotated 45° has an AABB of side
  // 100·√2 ≈ 141.4 sharing the same centre — exactly what
  // getBoundingClientRect reports and what the caller passes as `box`.
  const side = 100 * Math.SQRT2;
  const box = { top: 400 - side / 2, left: 500 - side / 2, width: side, height: side };
  const result = resolveAnchoredToolbarStack({
    box,
    bars: [BAR],
    viewport: VIEWPORT,
  });
  assert.equal(result.placement, "above");
  // The bar clears the TILTED element's topmost visual point (the AABB top),
  // not the smaller unrotated box — so it can never sit on a rotated corner.
  assert.ok(result.bars[0].top + BAR.height <= box.top - ANCHOR_GAP + 1);
  // Still centred on the element's visual centre.
  assert.equal(result.bars[0].left, Math.round(500 - BAR.width / 2));
});

test("menuShouldOpenUp: prefers down with room, flips up near the bottom", () => {
  assert.equal(
    menuShouldOpenUp({ anchorTop: 100, anchorBottom: 142, viewportHeight: 800 }),
    false,
  );
  assert.equal(
    menuShouldOpenUp({ anchorTop: 700, anchorBottom: 742, viewportHeight: 800 }),
    true,
  );
  // Short viewport, no side fits fully — the larger side wins.
  assert.equal(
    menuShouldOpenUp({
      anchorTop: 300,
      anchorBottom: 342,
      viewportHeight: 500,
      menuHeight: 400,
    }),
    true,
  );
});
