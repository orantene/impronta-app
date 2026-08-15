import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeResizeDims,
  isCornerHandle,
  RESIZE_GRID,
  RESIZE_MIN_SIZE,
  RESIZE_SNAP_THRESHOLD,
  resizeAnchorFraction,
  resizeHandleAxes,
  snapResizeLength,
  type ResizeHandleId,
} from "./canvas-resize-geometry";

const ALL_HANDLES: ResizeHandleId[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

test("resizeHandleAxes maps every handle to its moving edges", () => {
  assert.deepEqual(resizeHandleAxes("e"), { x: 1, y: 0 });
  assert.deepEqual(resizeHandleAxes("w"), { x: -1, y: 0 });
  assert.deepEqual(resizeHandleAxes("n"), { x: 0, y: -1 });
  assert.deepEqual(resizeHandleAxes("s"), { x: 0, y: 1 });
  assert.deepEqual(resizeHandleAxes("nw"), { x: -1, y: -1 });
  assert.deepEqual(resizeHandleAxes("se"), { x: 1, y: 1 });
  assert.equal(isCornerHandle("nw"), true);
  assert.equal(isCornerHandle("n"), false);
});

test("east/south drags grow with the pointer; west/north drags grow AGAINST it", () => {
  const base = { startW: 200, startH: 100, aspectLock: false, fromCenter: false };
  // E: +30 pointer → +30 width.
  assert.equal(computeResizeDims({ ...base, handle: "e", dxLocal: 30, dyLocal: 0 }).w, 230);
  // W: dragging LEFT (-30) grows width by 30 (the west edge moves outward).
  assert.equal(computeResizeDims({ ...base, handle: "w", dxLocal: -30, dyLocal: 0 }).w, 230);
  // N: dragging UP (-20) grows height.
  assert.equal(computeResizeDims({ ...base, handle: "n", dxLocal: 0, dyLocal: -20 }).h, 120);
  // S: dragging down grows height.
  assert.equal(computeResizeDims({ ...base, handle: "s", dxLocal: 0, dyLocal: 20 }).h, 120);
  // Unaffected axes pass through untouched and are flagged.
  const e = computeResizeDims({ ...base, handle: "e", dxLocal: 30, dyLocal: 50 });
  assert.equal(e.h, 100);
  assert.equal(e.affectsX, true);
  assert.equal(e.affectsY, false);
});

test("corner handles resize both axes from their pointer deltas", () => {
  const d = computeResizeDims({
    handle: "nw",
    startW: 200,
    startH: 100,
    dxLocal: -30, // outward (west)
    dyLocal: -20, // outward (north)
    aspectLock: false,
    fromCenter: false,
  });
  assert.equal(d.w, 230);
  assert.equal(d.h, 120);
  assert.equal(d.affectsX, true);
  assert.equal(d.affectsY, true);
});

test("⌥ (from centre) doubles the rate — both edges move", () => {
  const d = computeResizeDims({
    handle: "e",
    startW: 200,
    startH: 100,
    dxLocal: 15,
    dyLocal: 0,
    aspectLock: false,
    fromCenter: true,
  });
  assert.equal(d.w, 230); // 200 + 15×2
});

test("⇧ aspect lock on a corner preserves the grab-time ratio, dominant axis wins", () => {
  // 2:1 element; width change dominates → height derives from width.
  const d = computeResizeDims({
    handle: "se",
    startW: 200,
    startH: 100,
    dxLocal: 100, // +50% width
    dyLocal: 10, // +10% height (weaker)
    aspectLock: true,
    fromCenter: false,
  });
  assert.equal(d.w, 300);
  assert.equal(d.h, 150);
  // Height dominates → width derives from height.
  const d2 = computeResizeDims({
    handle: "se",
    startW: 200,
    startH: 100,
    dxLocal: 10,
    dyLocal: 60, // +60% height
    aspectLock: true,
    fromCenter: false,
  });
  assert.equal(d2.h, 160);
  assert.equal(d2.w, 320);
});

test("⇧ aspect lock is ignored on edge handles", () => {
  const d = computeResizeDims({
    handle: "e",
    startW: 200,
    startH: 100,
    dxLocal: 100,
    dyLocal: 0,
    aspectLock: true,
    fromCenter: false,
  });
  assert.equal(d.w, 300);
  assert.equal(d.h, 100); // untouched
});

test("min-size floor clamps, and preserves a locked ratio by growing both", () => {
  // Unlocked: each axis clamps independently.
  const d = computeResizeDims({
    handle: "se",
    startW: 200,
    startH: 100,
    dxLocal: -500,
    dyLocal: -500,
    aspectLock: false,
    fromCenter: false,
  });
  assert.equal(d.w, RESIZE_MIN_SIZE);
  assert.equal(d.h, RESIZE_MIN_SIZE);
  // Locked 2:1: the SMALLER dimension hits the floor and the other keeps ratio.
  const locked = computeResizeDims({
    handle: "se",
    startW: 200,
    startH: 100,
    dxLocal: -400,
    dyLocal: -10,
    aspectLock: true,
    fromCenter: false,
  });
  assert.equal(locked.h, RESIZE_MIN_SIZE);
  assert.equal(locked.w, RESIZE_MIN_SIZE * 2);
});

test("snapResizeLength: parent target wins inside threshold, else grid, ⌘ free", () => {
  const targets = [{ value: 640, label: "Full" }, { value: 320, label: "½" }];
  // Inside the 14px threshold of a target → capture + label.
  assert.deepEqual(snapResizeLength(640 - RESIZE_SNAP_THRESHOLD, false, targets), {
    value: 640,
    label: "Full",
  });
  // Outside every target → 8px grid.
  const grid = snapResizeLength(451, false, targets);
  assert.equal(grid.value % RESIZE_GRID, 0);
  assert.equal(grid.label, null);
  // Free (⌘): raw value rounded, no capture even 1px from a target.
  assert.deepEqual(snapResizeLength(639.4, true, targets), { value: 639, label: null });
});

test("resizeAnchorFraction pins the opposite edge (or the centre under ⌥)", () => {
  // Dragging W keeps the EAST edge planted.
  assert.deepEqual(resizeAnchorFraction("w", false), { fx: 1, fy: 0.5 });
  // Dragging N keeps the SOUTH edge planted.
  assert.deepEqual(resizeAnchorFraction("n", false), { fx: 0.5, fy: 1 });
  // NW keeps the SE corner planted.
  assert.deepEqual(resizeAnchorFraction("nw", false), { fx: 1, fy: 1 });
  assert.deepEqual(resizeAnchorFraction("se", false), { fx: 0, fy: 0 });
  // ⌥ always pins the centre, whatever the handle.
  for (const handle of ALL_HANDLES) {
    assert.deepEqual(resizeAnchorFraction(handle, true), { fx: 0.5, fy: 0.5 });
  }
});
