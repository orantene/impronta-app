import assert from "node:assert/strict";
import test from "node:test";

import { GAP_PRESETS } from "../field-kit/preset-values";
import { scaleStepperView, stepScale } from "../field-kit/scale-stepper-state";
import {
  describeStack,
  fillClause,
  gapFieldValue,
  gapPatchValue,
  isForeignGridTemplate,
  minColumnWidthTemplate,
  parseMinColumnWidth,
  tierSupportsStyleOverrides,
} from "./stack-model";

test("gap reads back as the step it was stored as", () => {
  assert.equal(scaleStepperView(GAP_PRESETS, gapFieldValue("s")).stepId, "s");
  assert.equal(scaleStepperView(GAP_PRESETS, gapFieldValue("l")).stepId, "l");
});

test("an unset gap reads as unset, not as a rewritten default", () => {
  const view = scaleStepperView(GAP_PRESETS, gapFieldValue(undefined));
  assert.equal(view.mode, "unset");
});

test("a gap id no scale owns reads as unset rather than snapping to a step", () => {
  // Nothing writes "xl" today, but a retired step must not be re-lit as the
  // nearest surviving one: the panel would then be showing a value the tree
  // does not hold.
  const view = scaleStepperView(GAP_PRESETS, gapFieldValue("xl"));
  assert.equal(view.mode, "unset");
  assert.equal(view.stepId, null);
});

test("stepping the gap walks the renderer scale and clears below the first step", () => {
  assert.equal(gapPatchValue(stepScale(GAP_PRESETS, gapFieldValue("s"), 1)), "m");
  assert.equal(gapPatchValue(stepScale(GAP_PRESETS, gapFieldValue("m"), 1)), "l");
  assert.equal(gapPatchValue(stepScale(GAP_PRESETS, gapFieldValue("l"), 1)), "l");
  assert.equal(gapPatchValue(stepScale(GAP_PRESETS, gapFieldValue("m"), -1)), "s");
  assert.equal(gapPatchValue(stepScale(GAP_PRESETS, gapFieldValue("s"), -1)), undefined);
});

test("a custom gap value is refused rather than coerced into the enum", () => {
  assert.equal(gapPatchValue({ kind: "custom", numeric: { value: 18, unit: "px" } }), false);
});

test("minimum column width round-trips through the template", () => {
  const template = minColumnWidthTemplate(240, "px");
  assert.equal(template, "repeat(auto-fit, minmax(240px, 1fr))");
  assert.deepEqual(parseMinColumnWidth(template), { value: 240, unit: "px" });
});

test("auto-fill and whitespace variants parse the same way", () => {
  assert.deepEqual(parseMinColumnWidth("repeat(auto-fill,minmax(18rem,1fr))"), {
    value: 18,
    unit: "rem",
  });
  assert.deepEqual(parseMinColumnWidth("  repeat( auto-fit , minmax( 30% , 1fr ) )  "), {
    value: 30,
    unit: "%",
  });
});

test("a hand-authored template is never re-expressed as a minimum width", () => {
  // THE INVARIANT: mounting the panel over a saved design must not move it.
  for (const raw of ["2fr 1fr", "repeat(3, minmax(0, 1fr))", "minmax(200px, 1fr) 2fr", "subgrid"]) {
    assert.equal(parseMinColumnWidth(raw), null, raw);
    assert.equal(isForeignGridTemplate(raw), true, raw);
  }
});

test("an empty template is not reported as foreign", () => {
  assert.equal(isForeignGridTemplate(undefined), false);
  assert.equal(isForeignGridTemplate(""), false);
  assert.equal(isForeignGridTemplate("   "), false);
});

test("a zero or negative minimum is refused", () => {
  assert.equal(parseMinColumnWidth("repeat(auto-fit, minmax(0px, 1fr))"), null);
  assert.equal(parseMinColumnWidth("repeat(auto-fit, minmax(-4px, 1fr))"), null);
});

test("only the built-in tiers carry style-backed overrides", () => {
  assert.equal(tierSupportsStyleOverrides("desktop"), true);
  assert.equal(tierSupportsStyleOverrides("tablet"), true);
  assert.equal(tierSupportsStyleOverrides("mobile"), true);
  assert.equal(tierSupportsStyleOverrides("wide"), false);
  assert.equal(tierSupportsStyleOverrides("compact-phone"), false);
});

/** The summary as an English reader sees it, with the tokens filled. */
function summary(shape: Parameters<typeof describeStack>[0]): string[] {
  return describeStack(shape).map((clause) => fillClause(clause.key, clause.vars));
}

test("the summary states only what is actually set", () => {
  assert.deepEqual(summary({ direction: "stack" }), ["Stacked top to bottom"]);
  assert.deepEqual(summary({ direction: "stack", align: "center" }), [
    "Stacked top to bottom",
    "aligned to the center",
  ]);
});

test("a row reports its wrapping, because the renderer wraps rows by default", () => {
  assert.deepEqual(summary({ direction: "row" }), [
    "In a row, left to right",
    "wrapping onto new lines",
  ]);
  assert.deepEqual(summary({ direction: "row", wrap: "nowrap" }), [
    "In a row, left to right",
    "on one line, no wrapping",
  ]);
});

test("a grid reports its column count, or the minimum width that replaces it", () => {
  assert.deepEqual(summary({ direction: "grid", columns: 3 }), ["In a grid", "3 columns"]);
  assert.deepEqual(
    summary({ direction: "grid", columns: 3, minColumnWidth: { value: 240, unit: "px" } }),
    ["In a grid", "reflowing at 240px per column"],
  );
  assert.deepEqual(summary({ direction: "grid", columns: 1 }), ["In a grid", "1 column"]);
});

test("a numeric clause reaches the catalog as a template, not as finished text", () => {
  // A clause built by string interpolation would be a different catalog key
  // for every column count, so the Spanish panel could never look it up.
  assert.deepEqual(describeStack({ direction: "grid", columns: 4 })[1], {
    key: "{count} columns",
    vars: { "{count}": "4" },
  });
});

test("a slider says it scrolls instead of claiming a grid", () => {
  assert.deepEqual(summary({ direction: "grid", columns: 4, slider: true }), [
    "Side to side, one scrolling row",
  ]);
});

test("justification and alignment are reported in flow order", () => {
  assert.deepEqual(
    summary({ direction: "row", wrap: "nowrap", justify: "space-between", align: "center" }),
    [
      "In a row, left to right",
      "on one line, no wrapping",
      "spread edge to edge",
      "aligned to the center",
    ],
  );
});

test("an unrecognised justify or align value is dropped, never guessed at", () => {
  assert.deepEqual(summary({ direction: "stack", justify: "safe center", align: "baseline" }), [
    "Stacked top to bottom",
  ]);
});

