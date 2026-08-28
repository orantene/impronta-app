/**
 * canvas-move-place.test.ts — B7 drag-to-place for absolute children.
 *
 * Pins: an absolute drag writes top/left (not only translate); a mobile patch
 * leaves desktop insets untouched via the real `styleWithViewportPatch`; the
 * move-step function snaps through `snapToGuideLines` so operator guides still
 * win inside tolerance.
 *
 * Run: node_modules/.bin/tsx --test \
 *   src/components/edit-chrome/canvas-move-place.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { BuilderNodeStyle } from "@/lib/site-admin/builder-node";
import { isResponsivePlumbedStyleKey } from "@/lib/site-admin/builder-node/responsive-style-keys";

import { snapToGuideLines } from "./canvas-guide-snap";
import {
  formatInsetPx,
  isOutOfFlowPosition,
  MOVE_ALIGN_PX,
  MOVE_GRID_PX,
  parseInsetPx,
  resolveMoveDragStep,
  resolveMovePlacement,
  snapMoveToGuideLines,
  styleWithAbsolutePlacePatch,
  viewportFromCanvasBucket,
  type MoveDragOrigin,
} from "./canvas-move-place";
import {
  styleWithViewportPatch,
  type StyleCleaners,
} from "./inspectors/style-panel/viewport-style-patch";

const PASS_THROUGH: StyleCleaners = {
  cleanStyle: (v) => v,
  cleanValue: (v) => v,
};

function origin(overrides: Partial<MoveDragOrigin> = {}): MoveDragOrigin {
  return {
    x: 0,
    y: 0,
    natCx: 50,
    natCy: 50,
    natLeft: 0,
    natTop: 0,
    width: 100,
    height: 100,
    halfW: 50,
    halfH: 50,
    snapX: [],
    snapY: [],
    sibBoxes: [],
    guideLines: { v: [], h: [] },
    ...overrides,
  };
}

test("absolute and fixed are out of flow; in-flow positions are not", () => {
  assert.equal(isOutOfFlowPosition("absolute"), true);
  assert.equal(isOutOfFlowPosition("fixed"), true);
  assert.equal(isOutOfFlowPosition("relative"), false);
  assert.equal(isOutOfFlowPosition("sticky"), false);
  assert.equal(isOutOfFlowPosition(undefined), false);
  assert.equal(resolveMovePlacement({ position: "absolute" }, null), "absolute");
  assert.equal(resolveMovePlacement({ position: "relative" }, null), "translate");
  assert.equal(resolveMovePlacement({}, null), "translate");
});

test("a mobile-only position:absolute does not convert the desktop translate path", () => {
  const style = {
    position: "relative",
    responsive: { mobile: { position: "absolute" } },
  };
  assert.equal(resolveMovePlacement(style, null), "translate");
  assert.equal(resolveMovePlacement(style, "mobile"), "absolute");
});

test("top and left have a breakpoint lane so a mobile place can render", () => {
  assert.equal(isResponsivePlumbedStyleKey("top"), true);
  assert.equal(isResponsivePlumbedStyleKey("left"), true);
  assert.equal(viewportFromCanvasBucket("mobile"), "mobile");
  assert.equal(viewportFromCanvasBucket(null), "desktop");
});

test("an absolute desktop place writes top/left and leaves translate alone", () => {
  const current: BuilderNodeStyle = {
    position: "absolute",
    top: "10px",
    left: "20px",
    translate: "4px 0px",
  };
  const next = styleWithAbsolutePlacePatch({
    currentStyle: current,
    viewport: "desktop",
    left: 48,
    top: 32,
    startLeft: 20,
    startTop: 10,
  });
  assert.equal(next?.top, "32px");
  assert.equal(next?.left, "48px");
  assert.equal(next?.translate, "4px 0px", "translate is not the place write");
  assert.equal(next?.position, "absolute", "drag does not rewrite position");
  assert.equal(next?.responsive, undefined);
});

test("a mobile place lands in responsive.mobile and leaves desktop top/left", () => {
  const current: BuilderNodeStyle = {
    position: "absolute",
    top: "10px",
    left: "20px",
    translate: "8px 8px",
  };
  const next = styleWithAbsolutePlacePatch({
    currentStyle: current,
    viewport: "mobile",
    left: 48,
    top: 32,
    startLeft: 20,
    startTop: 10,
  });
  assert.equal(next?.top, "10px", "desktop top must survive a mobile drag");
  assert.equal(next?.left, "20px", "desktop left must survive a mobile drag");
  assert.equal(next?.translate, "8px 8px", "desktop translate stays off the place path");
  assert.equal(next?.responsive?.mobile?.top, "32px");
  assert.equal(next?.responsive?.mobile?.left, "48px");
  assert.equal(
    next?.responsive?.mobile?.translate,
    undefined,
    "a mobile place must not write translate into the phone bucket",
  );
});

test("the place helper writes through styleWithViewportPatch (same routing)", () => {
  const current: BuilderNodeStyle = {
    position: "absolute",
    top: "10px",
    left: "20px",
  };
  const viaHelper = styleWithAbsolutePlacePatch({
    currentStyle: current,
    viewport: "mobile",
    left: 40,
    top: 24,
    startLeft: 20,
    startTop: 10,
  });
  const viaPatch = styleWithViewportPatch(
    current,
    "mobile",
    "viewport",
    { top: "24px", left: "40px" },
    PASS_THROUGH,
  );
  assert.equal(viaHelper?.responsive?.mobile?.top, viaPatch?.responsive?.mobile?.top);
  assert.equal(viaHelper?.responsive?.mobile?.left, viaPatch?.responsive?.mobile?.left);
  assert.equal(viaHelper?.top, viaPatch?.top);
  assert.equal(viaHelper?.left, viaPatch?.left);
});

test("an authored right/bottom shifts with the place so the box does not stretch", () => {
  const next = styleWithAbsolutePlacePatch({
    currentStyle: {
      position: "absolute",
      top: "10px",
      left: "20px",
      right: "30px",
      bottom: "40px",
    },
    viewport: "desktop",
    left: 28,
    top: 18,
    startLeft: 20,
    startTop: 10,
  });
  assert.equal(next?.left, "28px");
  assert.equal(next?.top, "18px");
  assert.equal(next?.right, "22px");
  assert.equal(next?.bottom, "32px");
});

test("parse/format inset px round-trip; auto is unset", () => {
  assert.equal(parseInsetPx("24px"), 24);
  assert.equal(parseInsetPx("-8px"), -8);
  assert.equal(parseInsetPx("auto"), null);
  assert.equal(parseInsetPx(""), null);
  assert.equal(formatInsetPx(24.4), "24px");
});

test("8px grid snap; ⌘ is free (whole pixels only)", () => {
  const stepped = resolveMoveDragStep({
    origin: origin(),
    rawX: 20,
    rawY: 11,
    free: false,
  });
  assert.equal(stepped.x % MOVE_GRID_PX, 0);
  assert.equal(stepped.y % MOVE_GRID_PX, 0);
  const free = resolveMoveDragStep({
    origin: origin(),
    rawX: 20,
    rawY: 11,
    free: true,
  });
  assert.equal(free.x, 20);
  assert.equal(free.y, 11);
  assert.equal(free.userV, null);
});

test("snapMoveToGuideLines is snapToGuideLines (guides win inside tolerance)", () => {
  const lines = [{ id: "g", axis: "y" as const, positionPx: 104 }];
  const hit = snapMoveToGuideLines(100, lines, "y", MOVE_ALIGN_PX);
  const direct = snapToGuideLines(100, lines, "y", MOVE_ALIGN_PX);
  assert.deepEqual(hit, direct);
  assert.equal(hit.guide, 104);
  const miss = snapMoveToGuideLines(100, lines, "y", 3);
  assert.equal(miss.guide, null);
  assert.equal(miss.pos, 100);
});

test("resolveMoveDragStep snaps a left edge to a vertical guide inside ALIGN", () => {
  const stepped = resolveMoveDragStep({
    origin: origin({
      guideLines: {
        v: [{ id: "g", axis: "y", positionPx: 18 }],
        h: [],
      },
    }),
    rawX: 20,
    rawY: 0,
    free: false,
  });
  assert.equal(stepped.x, 18);
  assert.equal(stepped.userV, 18);
});

test("a sibling edge snap wins over a guide on the same axis", () => {
  const stepped = resolveMoveDragStep({
    origin: origin({
      snapX: [16],
      guideLines: {
        v: [{ id: "g", axis: "y", positionPx: 18 }],
        h: [],
      },
    }),
    rawX: 16,
    rawY: 0,
    free: false,
  });
  assert.equal(stepped.x, 16);
  assert.equal(stepped.alignV, 16);
  assert.equal(stepped.userV, null, "sibling/parent edge claims the axis first");
});
