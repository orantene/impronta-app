/**
 * spacing-side-fields.test.ts — what a per-side spacing control reads and writes.
 *
 * Two things this has to pin:
 *   1. A step writes the SCALE's value (`"1.5rem"`), not a px re-rounding and
 *      not whatever number happened to be in the box.
 *   2. A raw length that a tenant hand-authored survives untouched and is
 *      reported as custom, so the panel shows the page as it is.
 *
 * Test runner: node:test + node:assert/strict (builder-chrome lane).
 * Run: node_modules/.bin/tsx --test \
 *   src/components/edit-chrome/inspectors/style-panel/spacing-side-fields.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { NODE_SPACING } from "@/lib/site-admin/builder-node/style-scales";

import {
  MARGIN_SIDES,
  PADDING_SIDES,
  hasOffScaleSide,
  spacingSideBoundLabel,
  spacingSidePatch,
  spacingSideValue,
} from "./spacing-side-fields";

test("the eight sides are the free-length keys the renderer honours per breakpoint", () => {
  assert.deepEqual(
    PADDING_SIDES.map((s) => s.key),
    ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"],
  );
  assert.deepEqual(
    MARGIN_SIDES.map((s) => s.key),
    ["marginTopFree", "marginRightFree", "marginBottomFree", "marginLeftFree"],
  );
});

// ── A step writes the token scale's own value ───────────────────────────────

test("picking a step writes the renderer's scale value, in the scale's own unit", () => {
  assert.deepEqual(spacingSidePatch("paddingTop", { kind: "preset", id: "m" }), {
    paddingTop: NODE_SPACING.m,
  });
  assert.equal(NODE_SPACING.m, "1.5rem", "px re-rounding would re-scale the page at any root size other than 16");
  assert.deepEqual(spacingSidePatch("marginLeftFree", { kind: "preset", id: "xl" }), {
    marginLeftFree: NODE_SPACING.xl,
  });
});

test("a step's value reads back as that step, so the control and the page agree", () => {
  assert.deepEqual(spacingSideValue(NODE_SPACING.l), { kind: "preset", id: "l" });
  // The renderer writes rem; the scale's captions are px. Both must resolve to
  // the same step or the readout would sit dark beside a number it just wrote.
  assert.deepEqual(spacingSideValue("48px"), { kind: "preset", id: "l" });
});

test("clearing a side clears the key rather than writing an empty string", () => {
  assert.deepEqual(spacingSidePatch("paddingBottom", { kind: "unset" }), {
    paddingBottom: undefined,
  });
});

test("an exact value writes itself, unrounded and in its own unit", () => {
  assert.deepEqual(
    spacingSidePatch("paddingLeft", { kind: "custom", numeric: { value: 18, unit: "px" } }),
    { paddingLeft: "18px" },
  );
});

// ── THE INVARIANT: an existing raw design is never restated ─────────────────

test("a hand-authored length reads back as itself, not as the nearest step", () => {
  assert.deepEqual(spacingSideValue("120px"), {
    kind: "custom",
    numeric: { value: 120, unit: "px" },
  });
  assert.deepEqual(spacingSideValue("18px"), {
    kind: "custom",
    numeric: { value: 18, unit: "px" },
  });
  assert.deepEqual(spacingSideValue("7.5%"), {
    kind: "custom",
    numeric: { value: 7.5, unit: "%" },
  });
});

test("the exact-values panel opens over a design that is off the scale", () => {
  assert.equal(hasOffScaleSide(["18px", undefined, undefined, undefined]), true);
  assert.equal(hasOffScaleSide([NODE_SPACING.m, "48px", undefined, undefined]), false);
  assert.equal(hasOffScaleSide([undefined, undefined, undefined, undefined]), false);
});

// ── Theme-bound sides ───────────────────────────────────────────────────────

test("a side bound to a theme token is reported as bound, not as an empty field", () => {
  assert.equal(spacingSideBoundLabel("18px"), null);
  assert.equal(spacingSideBoundLabel(undefined), null);
  assert.equal(spacingSideBoundLabel("token:space.section-y"), "Spacing — section rhythm");
  // A sentinel the registry does not know stays null rather than inventing a
  // label for it.
  assert.equal(spacingSideBoundLabel("token:not.a.real.token"), null);
});

// ── REGRESSION: the bottom step's bare "0" must survive the round trip ──────
//
// The shipped defect: the "none" step stores the renderer's own CSS — the bare
// string "0" — and `parseCssLength` refused unitless zero, so the value read
// back as UNSET. Every plus press then recomputed "first step from unset" and
// rewrote "0" forever: label stuck on Auto, page stuck at 0, control dead on
// every tier. The wiring is pinned end to end in spacing-stepper-wiring.test.tsx;
// this pins the pure seam that broke.

test("the none step's bare '0' reads back as the none step, not as unset", () => {
  assert.deepEqual(spacingSidePatch("paddingTop", { kind: "preset", id: "none" }), {
    paddingTop: NODE_SPACING.none,
  });
  assert.equal(NODE_SPACING.none, "0", "the renderer's bottom step is unitless zero");
  assert.deepEqual(spacingSideValue("0"), { kind: "preset", id: "none" });
  assert.deepEqual(spacingSideValue("0px"), { kind: "preset", id: "none" });
});
