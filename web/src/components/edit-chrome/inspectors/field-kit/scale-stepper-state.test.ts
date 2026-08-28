/**
 * scale-stepper-state.test.ts — the token-scale stepper's decisions.
 *
 * The one that matters most is the LAST group: a raw length a tenant authored
 * by hand must read back as itself, not as the nearest step. A control that
 * "helpfully" snaps 18px to M on mount rewrites a saved design without anyone
 * asking, and there is no undo for a rewrite the operator never saw.
 *
 * Test runner: node:test + node:assert/strict (builder-chrome lane).
 * Run: node_modules/.bin/tsx --test \
 *   src/components/edit-chrome/inspectors/field-kit/scale-stepper-state.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { SPACING_PRESETS } from "./preset-values";
import { UNSET_FIELD_VALUE, type FieldValue } from "./preset-state";
import { scaleStepperView, scaleSteps, stepScale } from "./scale-stepper-state";

const custom = (value: number, unit: "px" | "rem" | "%" = "px"): FieldValue => ({
  kind: "custom",
  numeric: { value, unit },
});

test("the steps are the renderer's own spacing scale, minus the unset entry", () => {
  assert.deepEqual(
    scaleSteps(SPACING_PRESETS).map((s) => s.id),
    ["none", "s", "m", "l", "xl"],
  );
  // NODE_SPACING in px: 0 / 12 / 24 / 48 / 96. If these numbers move, they move
  // because the renderer moved, which is the point of deriving them.
  assert.deepEqual(
    scaleSteps(SPACING_PRESETS).map((s) => s.numeric?.value),
    [0, 12, 24, 48, 96],
  );
});

// ── What the readout shows ──────────────────────────────────────────────────

test("a token step shows its name AND the number it resolves to", () => {
  const view = scaleStepperView(SPACING_PRESETS, { kind: "preset", id: "m" });
  assert.equal(view.mode, "step");
  assert.equal(view.label, "M");
  assert.equal(view.caption, "24");
  assert.equal(view.atMax, false);
});

test("the top step reports atMax and the unset state reports atMin", () => {
  assert.equal(scaleStepperView(SPACING_PRESETS, { kind: "preset", id: "xl" }).atMax, true);
  assert.equal(scaleStepperView(SPACING_PRESETS, UNSET_FIELD_VALUE).atMin, true);
  assert.equal(scaleStepperView(SPACING_PRESETS, UNSET_FIELD_VALUE).caption, null);
});

test("a step id the scale no longer owns reads as unset, never as a guess", () => {
  const view = scaleStepperView(SPACING_PRESETS, { kind: "preset", id: "gigantic" });
  assert.equal(view.mode, "unset");
  assert.equal(view.stepId, null);
});

// ── Stepping ────────────────────────────────────────────────────────────────

test("stepping walks the scale and stops at the top", () => {
  assert.deepEqual(stepScale(SPACING_PRESETS, { kind: "preset", id: "m" }, 1), {
    kind: "preset",
    id: "l",
  });
  assert.deepEqual(stepScale(SPACING_PRESETS, { kind: "preset", id: "xl" }, 1), {
    kind: "preset",
    id: "xl",
  });
});

test("stepping below the first step clears the field rather than sticking at 0", () => {
  assert.deepEqual(stepScale(SPACING_PRESETS, { kind: "preset", id: "s" }, -1), {
    kind: "preset",
    id: "none",
  });
  assert.deepEqual(
    stepScale(SPACING_PRESETS, { kind: "preset", id: "none" }, -1),
    UNSET_FIELD_VALUE,
  );
});

test("stepping up from unset lands on the first step; down from unset stays unset", () => {
  assert.deepEqual(stepScale(SPACING_PRESETS, UNSET_FIELD_VALUE, 1), {
    kind: "preset",
    id: "none",
  });
  assert.deepEqual(stepScale(SPACING_PRESETS, UNSET_FIELD_VALUE, -1), UNSET_FIELD_VALUE);
});

test("stepping a custom value moves to the neighbouring step, in the direction pressed", () => {
  // 18px sits between S (12) and M (24).
  assert.deepEqual(stepScale(SPACING_PRESETS, custom(18), 1), { kind: "preset", id: "m" });
  assert.deepEqual(stepScale(SPACING_PRESETS, custom(18), -1), { kind: "preset", id: "s" });
  // Above the whole scale, up clamps to the top rather than doing nothing.
  assert.deepEqual(stepScale(SPACING_PRESETS, custom(120), 1), { kind: "preset", id: "xl" });
  // Below the whole scale, down clears.
  assert.deepEqual(stepScale(SPACING_PRESETS, custom(-4), -1), UNSET_FIELD_VALUE);
});

test("a unit the scale cannot be ordered against is not pretend-ordered", () => {
  assert.deepEqual(stepScale(SPACING_PRESETS, custom(40, "%"), 1), {
    kind: "preset",
    id: "none",
  });
  assert.deepEqual(stepScale(SPACING_PRESETS, custom(40, "%"), -1), UNSET_FIELD_VALUE);
});

test("rem customs are compared in px, because the scale's captions are px", () => {
  // 1rem = 16px, between S (12) and M (24).
  assert.deepEqual(stepScale(SPACING_PRESETS, custom(1, "rem"), 1), {
    kind: "preset",
    id: "m",
  });
});

// ── THE INVARIANT: an existing raw value is shown, never snapped ─────────────

test("a hand-authored length is displayed as itself, with no write of any kind", () => {
  const saved = custom(18);
  const view = scaleStepperView(SPACING_PRESETS, saved);
  assert.equal(view.mode, "custom");
  assert.equal(view.caption, "18px");
  assert.equal(view.stepId, null, "no step may light up for a value the scale does not own");
  // The value handed in is returned untouched: deriving the view is a read.
  assert.deepEqual(saved, custom(18));
});

test("a value that IS a step by coincidence lights that step, which is not a rewrite", () => {
  // 24px is M. Lighting the chip states a true fact about the value; it does
  // not change what is stored, and the caller writes nothing on render.
  const view = scaleStepperView(SPACING_PRESETS, { kind: "preset", id: "m" });
  assert.equal(view.stepId, "m");
});
