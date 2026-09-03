import test from "node:test";
import assert from "node:assert/strict";

import { INDUSTRY_PRESET_IDS } from "./presets";
import { presetPickerModel, presetSummary } from "./picker-options";

/**
 * The invariant these exist to hold: **a `<select>`'s value is always one of
 * its options.**
 *
 * Spaces lost a live workspace's timezone to the violation today. A `<select>`
 * whose value matches no option does not error, does not warn, and does not
 * render empty — it silently displays the FIRST option, and the next Save
 * writes the displayed value. A correct program showing a wrong value, then
 * making it true.
 */

test("the selected value is ALWAYS present in the options", () => {
  // Every input a real column can hold: the sixteen valid ids, plus everything
  // that could have reached the JSONB by any other route.
  const inputs: unknown[] = [
    ...INDUSTRY_PRESET_IDS,
    null,
    undefined,
    "",
    "   ",
    "nonsense",
    "RESTAURANT",
    "  Restaurant  ",
    7,
    {},
    [],
    true,
  ];
  for (const raw of inputs) {
    for (const locale of ["en", "es"] as const) {
      const { options, selected } = presetPickerModel(raw, locale);
      assert.ok(
        options.some((o) => o.value === selected),
        `${JSON.stringify(raw)} (${locale}) selected "${selected}" with no matching option`,
      );
    }
  }
});

test("an unrecognised stored value shows Custom, not the first preset", () => {
  // The exact silent-rebrand this prevents: a workspace holding a value outside
  // the set would otherwise display "Restaurant" and save it on the next click.
  const { options, selected } = presetPickerModel("something-we-retired", "en");
  assert.equal(selected, "custom");
  assert.notEqual(options[0]?.value, selected, "custom is not first, so a mismatch would show Restaurant");
  assert.ok(options.some((o) => o.value === "custom"));
});

test("case and whitespace in the column still select the right row", () => {
  assert.equal(presetPickerModel("  Restaurant  ", "en").selected, "restaurant");
  assert.equal(presetPickerModel("SALON_BARBER", "en").selected, "salon_barber");
});

test("every option has a non-blank label and blurb, in both languages", () => {
  const offenders: string[] = [];
  for (const locale of ["en", "es"] as const) {
    for (const option of presetPickerModel(null, locale).options) {
      if (!option.label.trim()) offenders.push(`${option.value}.label.${locale}`);
      if (!option.blurb.trim()) offenders.push(`${option.value}.blurb.${locale}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("all sixteen presets are offered, with no duplicates", () => {
  const { options } = presetPickerModel(null, "en");
  assert.equal(options.length, 16);
  assert.equal(new Set(options.map((o) => o.value)).size, 16);
});

test("the summary says what the choice turns on, before it is made", () => {
  // The picker sits ABOVE the values it writes, so a person needs to know what
  // changes before choosing rather than after.
  const restaurant = presetSummary("restaurant", "en");
  assert.ok(restaurant.includes("menu"));
  assert.ok(restaurant.includes("reservations"));

  const es = presetSummary("restaurant", "es");
  assert.ok(es.includes("menú"));
  assert.notEqual(es, restaurant, "es must not be English");

  // A preset that turns nothing on still says something useful rather than
  // rendering an empty line.
  assert.ok(presetSummary("custom", "en").trim().length > 0);
  assert.ok(presetSummary("agency", "en").trim().length > 0);
});

test("every preset produces a non-blank summary in both languages", () => {
  const offenders: string[] = [];
  for (const id of INDUSTRY_PRESET_IDS) {
    for (const locale of ["en", "es"] as const) {
      if (!presetSummary(id, locale).trim()) offenders.push(`${id}.${locale}`);
    }
  }
  assert.deepEqual(offenders, []);
});
