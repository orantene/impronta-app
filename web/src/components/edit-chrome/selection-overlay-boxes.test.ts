import assert from "node:assert/strict";
import test from "node:test";

import {
  applyOverlayBox,
  applyOverlayBoxes,
  isMeasurableRect,
  resolveOverlayBox,
  type OverlayBox,
} from "./selection-overlay-boxes";

/**
 * THE STUCK BORDER.
 *
 * Owner: "the border of selected section gets stuck when another user is there
 * in mobile and the other in desktop."
 *
 * Both rAF tracking loops in `selection-layer.tsx` used to bail with
 * `if (!el) return;` and wrote a raw `getBoundingClientRect()` with no
 * degenerate-rect guard. Bailing is the bug: an overlay whose target is gone
 * keeps its LAST coordinates on screen forever, because the only code that
 * cleared it (`scheduleRectRecompute`) needs a scroll/resize/observer signal
 * that a quietly-unmounted node never produces.
 *
 * These tests pin the replacement rule: an unmeasurable target HIDES its
 * overlay. If someone re-introduces a silent early return, `hides the overlay
 * when the target element is gone` fails.
 */

interface FakeStyle {
  visibility: string;
  top: string;
  left: string;
  width: string;
  height: string;
  transform: string;
}

function fakeOverlay(): { style: FakeStyle } {
  return {
    style: {
      visibility: "",
      top: "",
      left: "",
      width: "",
      height: "",
      transform: "",
    },
  };
}

function fakeTarget(rect: {
  top: number;
  left: number;
  width: number;
  height: number;
}) {
  return {
    getBoundingClientRect: () => rect,
    offsetWidth: rect.width,
    offsetHeight: rect.height,
    style: {},
  };
}

const BOX: OverlayBox = {
  top: 10,
  left: 20,
  width: 30,
  height: 40,
  transform: "",
};

const NO_TRANSFORM = () => ({ rotate: "none", scale: "none" });

test("a zero-sized rect is not measurable", () => {
  assert.equal(isMeasurableRect({ top: 0, left: 0, width: 0, height: 0 }), false);
  assert.equal(isMeasurableRect({ top: 0, left: 0, width: 0, height: 12 }), true);
  assert.equal(isMeasurableRect({ top: 0, left: 0, width: 12, height: 0 }), true);
});

test("resolveOverlayBox returns null for a missing element", () => {
  assert.equal(resolveOverlayBox(null, 1, NO_TRANSFORM), null);
  assert.equal(resolveOverlayBox(undefined, 1, NO_TRANSFORM), null);
});

test("resolveOverlayBox returns null for a detached (0x0) element", () => {
  // A detached node, a display:none node, and a node in a hidden device tier
  // all measure 0x0. Returning null is what makes the caller HIDE rather than
  // draw a 0x0 ring at the viewport origin — or, worse, leave the old one.
  const el = fakeTarget({ top: 0, left: 0, width: 0, height: 0 });
  assert.equal(
    resolveOverlayBox(el as unknown as HTMLElement, 1, NO_TRANSFORM),
    null,
  );
});

test("resolveOverlayBox passes an unrotated rect through untouched", () => {
  const el = fakeTarget({ top: 100, left: 50, width: 300, height: 200 });
  const box = resolveOverlayBox(el as unknown as HTMLElement, 1, NO_TRANSFORM);
  assert.deepEqual(box, {
    top: 100,
    left: 50,
    width: 300,
    height: 200,
    transform: "",
  });
});

test("resolveOverlayBox gives a rotated element the same rotation transform", () => {
  // The AABB of a tilted quad is wider than the element; the returned box is
  // the recovered unrotated box, and the overlay wears the tilt itself.
  const el = fakeTarget({ top: 0, left: 0, width: 400, height: 400 });
  const box = resolveOverlayBox(el as unknown as HTMLElement, 1, () => ({
    rotate: "45deg",
    scale: "none",
  }));
  assert.ok(box);
  assert.equal(box.transform, "rotate(45deg)");
  assert.equal(Math.round(box.width), 400);
  assert.equal(Math.round(box.height), 400);
});

test("applyOverlayBox writes the box and clears any previous hide", () => {
  const overlay = fakeOverlay();
  overlay.style.visibility = "hidden";
  applyOverlayBox(overlay as unknown as HTMLElement, BOX);
  assert.equal(overlay.style.visibility, "");
  assert.equal(overlay.style.top, "10px");
  assert.equal(overlay.style.left, "20px");
  assert.equal(overlay.style.width, "30px");
  assert.equal(overlay.style.height, "40px");
});

test("hides the overlay when the target element is gone", () => {
  // THE REGRESSION TEST. `null` must never be a no-op: the previous box has to
  // stop being visible, or the operator is left with a selection ring drawn
  // around nothing.
  const overlay = fakeOverlay();
  applyOverlayBox(overlay as unknown as HTMLElement, BOX);
  applyOverlayBox(overlay as unknown as HTMLElement, null);
  assert.equal(overlay.style.visibility, "hidden");
});

test("a hidden overlay comes back when its target is measurable again", () => {
  // Switching device tiers and back must not leave the chrome permanently
  // hidden — the hide is a state, not a one-way door.
  const overlay = fakeOverlay();
  applyOverlayBox(overlay as unknown as HTMLElement, null);
  applyOverlayBox(overlay as unknown as HTMLElement, BOX);
  assert.equal(overlay.style.visibility, "");
  assert.equal(overlay.style.top, "10px");
});

test("applyOverlayBoxes hides every overlay in the set, nulls included", () => {
  const ring = fakeOverlay();
  const handles = fakeOverlay();
  applyOverlayBoxes(
    [ring, null, handles] as unknown as ReadonlyArray<HTMLElement | null>,
    null,
  );
  assert.equal(ring.style.visibility, "hidden");
  assert.equal(handles.style.visibility, "hidden");
});
