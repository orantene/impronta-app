import assert from "node:assert/strict";
import { test } from "node:test";

import {
  normalizeAngleDeg,
  parseRotateDeg,
  parseScalePair,
  pointerAngleDeg,
  ROTATION_MAGNET_TOLERANCE,
  rotatedVisualBox,
  snapRotationDeg,
  toLocalAxesDeg,
} from "./canvas-transform-geometry";

// ── normalization ──────────────────────────────────────────────────────────

test("normalizeAngleDeg maps into (-180, 180]", () => {
  assert.equal(normalizeAngleDeg(0), 0);
  assert.equal(normalizeAngleDeg(180), 180);
  assert.equal(normalizeAngleDeg(-180), 180);
  assert.equal(normalizeAngleDeg(270), -90);
  assert.equal(normalizeAngleDeg(-270), 90);
  assert.equal(normalizeAngleDeg(720), 0);
  assert.equal(normalizeAngleDeg(365), 5);
  assert.equal(normalizeAngleDeg(-365), -5);
  // Never emits -0 (string formatting would print "-0deg").
  assert.ok(!Object.is(normalizeAngleDeg(-360), -0));
});

// ── CSS parsing ────────────────────────────────────────────────────────────

test("parseRotateDeg handles none and every CSS angle unit", () => {
  assert.equal(parseRotateDeg("none"), 0);
  assert.equal(parseRotateDeg(""), 0);
  assert.equal(parseRotateDeg(null), 0);
  assert.equal(parseRotateDeg("30deg"), 30);
  assert.equal(parseRotateDeg("-12.5deg"), -12.5);
  assert.equal(parseRotateDeg("0.5turn"), 180);
  assert.equal(parseRotateDeg("100grad"), 90);
  assert.ok(Math.abs(parseRotateDeg(`${Math.PI}rad`) - 180) < 1e-9);
});

test("parseScalePair handles none, uniform, and per-axis scales", () => {
  assert.deepEqual(parseScalePair("none"), { x: 1, y: 1 });
  assert.deepEqual(parseScalePair("1.05"), { x: 1.05, y: 1.05 });
  assert.deepEqual(parseScalePair("1.05 1.2"), { x: 1.05, y: 1.2 });
  assert.deepEqual(parseScalePair(undefined), { x: 1, y: 1 });
});

// ── the rotation magnet ────────────────────────────────────────────────────

test("magnet captures every 45° compass angle within the tolerance", () => {
  for (const target of [0, 45, 90, 135, 180, -45, -90, -135]) {
    assert.equal(snapRotationDeg({ raw: target + 4.9 }).deg, normalizeAngleDeg(target));
    assert.equal(snapRotationDeg({ raw: target - 4.9 }).deg, normalizeAngleDeg(target));
    assert.equal(snapRotationDeg({ raw: target + 4.9 }).snapped, true);
  }
  // 225/270/315 arrive normalized (-135/-90/-45) — same capture behaviour.
  assert.equal(snapRotationDeg({ raw: 226 }).deg, -135);
  assert.equal(snapRotationDeg({ raw: 271 }).deg, -90);
  assert.equal(snapRotationDeg({ raw: 313 }).deg, -45);
});

test("NEGATIVE: just outside the ±5° tolerance the magnet must NOT capture", () => {
  // These sit 5.1° from the nearest 45° multiple. A widened (wrong) threshold
  // would snap them and fail this test; a narrowed threshold fails the capture
  // test above. Together they pin the tolerance to exactly ±5°.
  const outside = ROTATION_MAGNET_TOLERANCE + 0.1;
  assert.equal(snapRotationDeg({ raw: 45 + outside }).deg, 50.1);
  assert.equal(snapRotationDeg({ raw: 45 + outside }).snapped, false);
  assert.equal(snapRotationDeg({ raw: -outside }).deg, -5.1);
  assert.equal(snapRotationDeg({ raw: 90 - outside }).deg, 84.9);
  // Exactly ON the tolerance boundary still captures (inclusive).
  assert.equal(snapRotationDeg({ raw: 45 + ROTATION_MAGNET_TOLERANCE }).deg, 45);
});

test("⇧ quantizes to 15° steps instead of the magnet", () => {
  assert.equal(snapRotationDeg({ raw: 22.4, fineStep: true }).deg, 15);
  assert.equal(snapRotationDeg({ raw: 22.6, fineStep: true }).deg, 30);
  assert.equal(snapRotationDeg({ raw: -7.4, fineStep: true }).deg, 0);
  assert.equal(snapRotationDeg({ raw: -8, fineStep: true }).deg, -15);
  // A value the magnet would leave free (e.g. 22°) is still stepped under ⇧.
  assert.equal(snapRotationDeg({ raw: 22, fineStep: true }).snapped, true);
});

test("⌘ disables all snapping and wins over ⇧", () => {
  assert.equal(snapRotationDeg({ raw: 44.9, disableSnap: true }).deg, 44.9);
  assert.equal(snapRotationDeg({ raw: 44.9, disableSnap: true }).snapped, false);
  assert.equal(
    snapRotationDeg({ raw: 22.4, disableSnap: true, fineStep: true }).deg,
    22.4,
  );
});

test("snap output is normalized and 0.1°-precise", () => {
  assert.equal(snapRotationDeg({ raw: 360 + 44 }).deg, 45); // 404 → 44 → magnet 45
  assert.equal(snapRotationDeg({ raw: 33.333, disableSnap: true }).deg, 33.3);
});

// ── rotated overlay geometry ───────────────────────────────────────────────

test("rotatedVisualBox recovers the unrotated box from the AABB centre", () => {
  // A 200×100 element at zoom 1, rotated 90°: its AABB is 100×200. The visual
  // box must be 200×100 centred on the AABB centre.
  const box = rotatedVisualBox({
    rectLeft: 50,
    rectTop: 0,
    rectWidth: 100,
    rectHeight: 200,
    offsetWidth: 200,
    offsetHeight: 100,
    zoom: 1,
    scaleX: 1,
    scaleY: 1,
  });
  assert.deepEqual(box, { top: 50, left: 0, width: 200, height: 100 });
});

test("rotatedVisualBox multiplies zoom and per-axis scale into the size", () => {
  const box = rotatedVisualBox({
    rectLeft: 0,
    rectTop: 0,
    rectWidth: 300,
    rectHeight: 300,
    offsetWidth: 200,
    offsetHeight: 100,
    zoom: 0.5,
    scaleX: 2,
    scaleY: 1,
  });
  assert.equal(box.width, 200); // 200 × 0.5 × 2
  assert.equal(box.height, 50); // 100 × 0.5 × 1
  assert.equal(box.left, 150 - 100);
  assert.equal(box.top, 150 - 25);
});

// ── local axes ─────────────────────────────────────────────────────────────

test("toLocalAxesDeg projects a screen delta onto rotated element axes", () => {
  // 90° rotation: screen +x maps to local -y? Verify via known values:
  // rotating (10, 0) by -90° yields (0, -10).
  const a = toLocalAxesDeg(10, 0, 90);
  assert.ok(Math.abs(a.x - 0) < 1e-9);
  assert.ok(Math.abs(a.y - -10) < 1e-9);
  // Identity at 0°.
  assert.deepEqual(toLocalAxesDeg(7, -3, 0), { x: 7, y: -3 });
  // Round-trip: rotating the local vector back by +θ restores the input.
  const local = toLocalAxesDeg(6, 8, 30);
  const back = toLocalAxesDeg(local.x, local.y, -30);
  assert.ok(Math.abs(back.x - 6) < 1e-9);
  assert.ok(Math.abs(back.y - 8) < 1e-9);
});

test("pointerAngleDeg measures around the pivot", () => {
  assert.equal(pointerAngleDeg(10, 0, 0, 0), 0);
  assert.equal(pointerAngleDeg(0, 10, 0, 0), 90);
  assert.equal(pointerAngleDeg(-10, 0, 0, 0), 180);
  // Differences drive the drag: a quarter-turn of pointer = 90° delta.
  const d = pointerAngleDeg(0, 10, 0, 0) - pointerAngleDeg(10, 0, 0, 0);
  assert.equal(d, 90);
});
