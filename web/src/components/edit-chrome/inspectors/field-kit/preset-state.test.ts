/**
 * preset-state.test.ts — D9 item 2, the preset ↔ custom contract.
 *
 * "Preset = shortcut, never a ceiling." Every claim that sentence makes is a
 * test below: a chip fills the number, a typed number deselects the chips into
 * an explicit custom state, and an exact re-match re-lights its chip (the
 * documented decision, tested in both directions so flipping it is loud).
 *
 * Runner: node:test + node:assert/strict.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  UNSET_FIELD_VALUE,
  applyNumber,
  applyPreset,
  chipStates,
  isCustom,
  rowSelection,
  type FieldValue,
} from "./preset-state";
import { RADIUS_PRESETS, SPACING_PRESETS } from "./preset-values";

// ── Clicking a chip fills the number (D9 item 2, first half) ────────────────

test("clicking a preset chip stores that preset", () => {
  assert.deepEqual(applyPreset(SPACING_PRESETS, "m"), { kind: "preset", id: "m" });
});

test("clicking a preset chip fills the exact input with its real number", () => {
  const value = applyPreset(SPACING_PRESETS, "m");
  const sel = rowSelection(SPACING_PRESETS, value);
  assert.equal(sel.mode, "preset");
  assert.equal(sel.presetId, "m");
  assert.deepEqual(
    sel.numeric,
    { value: 24, unit: "px" },
    "the whole point: the chip says M, and the number beside it says 24",
  );
});

test("clicking the default chip clears back to unset", () => {
  assert.deepEqual(applyPreset(SPACING_PRESETS, ""), UNSET_FIELD_VALUE);
});

test("clicking a chip with no single number (Pill) leaves the input empty", () => {
  const sel = rowSelection(RADIUS_PRESETS, applyPreset(RADIUS_PRESETS, "pill"));
  assert.equal(sel.presetId, "pill");
  assert.equal(sel.numeric, null, "999px is a sentinel, not a corner size to type over");
});

// ── Typing a number deselects the chips (D9 item 2, second half) ────────────

test("typing a value no preset owns enters the explicit custom state", () => {
  const value = applyNumber(SPACING_PRESETS, { value: 18, unit: "px" });
  assert.deepEqual(value, { kind: "custom", numeric: { value: 18, unit: "px" } });

  const sel = rowSelection(SPACING_PRESETS, value);
  assert.equal(sel.mode, "custom");
  assert.equal(sel.presetId, null, "no chip may stay lit over a custom number");
  assert.ok(isCustom(sel));
});

test("custom is distinguishable from unset, not merely 'nothing lit'", () => {
  const custom = rowSelection(SPACING_PRESETS, applyNumber(SPACING_PRESETS, { value: 18, unit: "px" }));
  const unset = rowSelection(SPACING_PRESETS, UNSET_FIELD_VALUE);
  assert.equal(custom.presetId, null);
  assert.equal(unset.presetId, null);
  assert.notEqual(
    custom.mode,
    unset.mode,
    "if these collapse, the operator cannot tell 'mine' from 'not set'",
  );
  assert.equal(isCustom(unset), false);
});

test("a preset is a shortcut, never a ceiling — values beyond the scale are allowed", () => {
  const huge = applyNumber(SPACING_PRESETS, { value: 240, unit: "px" });
  assert.equal(huge.kind, "custom");
  const tiny = applyNumber(SPACING_PRESETS, { value: 1, unit: "px" });
  assert.equal(tiny.kind, "custom");
});

test("a unit the preset scale never uses is still accepted as custom", () => {
  const vh = applyNumber(SPACING_PRESETS, { value: 10, unit: "vh" });
  assert.deepEqual(vh, { kind: "custom", numeric: { value: 10, unit: "vh" } });
});

test("clearing the input returns to unset, not to the previously lit preset", () => {
  assert.deepEqual(applyNumber(SPACING_PRESETS, null), UNSET_FIELD_VALUE);
});

// ── Re-lighting on exact match (the documented decision) ────────────────────

test("re-matching a preset value re-lights its chip", () => {
  const value = applyNumber(SPACING_PRESETS, { value: 24, unit: "px" });
  assert.deepEqual(value, { kind: "preset", id: "m" }, "24px IS the M preset");
  assert.equal(rowSelection(SPACING_PRESETS, value).presetId, "m");
});

test("re-lighting can be switched off per field, and then 24px stays custom", () => {
  const opts = { relightOnExactMatch: false };
  const value = applyNumber(SPACING_PRESETS, { value: 24, unit: "px" }, opts);
  assert.deepEqual(value, { kind: "custom", numeric: { value: 24, unit: "px" } });
  assert.equal(rowSelection(SPACING_PRESETS, value, opts).mode, "custom");
});

test("re-lighting respects units — 24rem does not become the M preset", () => {
  const value = applyNumber(SPACING_PRESETS, { value: 24, unit: "rem" });
  assert.equal(value.kind, "custom");
});

test("a stored custom value that happens to match renders as its preset", () => {
  const stored: FieldValue = { kind: "custom", numeric: { value: 48, unit: "px" } };
  assert.equal(rowSelection(SPACING_PRESETS, stored).presetId, "l");
});

// ── Round trips and edge cases ─────────────────────────────────────────────

test("chip → number → same chip is stable (no drift across a round trip)", () => {
  for (const id of ["s", "m", "l"]) {
    const fromChip = applyPreset(SPACING_PRESETS, id);
    const sel = rowSelection(SPACING_PRESETS, fromChip);
    assert.ok(sel.numeric);
    const reEntered = applyNumber(SPACING_PRESETS, sel.numeric!);
    assert.deepEqual(reEntered, fromChip, `round trip drifted for "${id}"`);
  }
});

test("an unknown stored preset id renders as unset rather than a phantom chip", () => {
  const sel = rowSelection(SPACING_PRESETS, { kind: "preset", id: "xxl-removed" });
  assert.equal(sel.mode, "unset");
  assert.equal(sel.presetId, null);
});

test("chipStates lights exactly one chip, and lights the default chip when unset", () => {
  const lit = (v: FieldValue) =>
    chipStates(SPACING_PRESETS, rowSelection(SPACING_PRESETS, v)).filter((c) => c.selected);

  assert.equal(lit(applyPreset(SPACING_PRESETS, "m")).length, 1);
  assert.equal(lit(applyPreset(SPACING_PRESETS, "m"))[0].preset.id, "m");

  const unsetLit = lit(UNSET_FIELD_VALUE);
  assert.equal(unsetLit.length, 1);
  assert.equal(unsetLit[0].preset.id, "");

  assert.equal(
    lit({ kind: "custom", numeric: { value: 18, unit: "px" } }).length,
    0,
    "custom lights nothing at all — including the default chip",
  );
});
