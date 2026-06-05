import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveSelectValue, matchLabelOption, labelForValue } from "./coerce-select-value";

const bodyType = {
  input: "select",
  options: [
    { value: "slim", label_en: "Slim" },
    { value: "athletic", label_en: "Athletic" },
    { value: "curvy", label_en: "Curvy" },
  ],
};

const hairColor = {
  input: "select",
  options: [
    { value: "dark_brown", label_en: "Dark Brown" },
    { value: "light_brown", label_en: "Light Brown" },
    { value: "blonde", label_en: "Blonde" },
  ],
};

test("exact canonical value passes through unchanged", () => {
  assert.deepEqual(resolveSelectValue(bodyType, "athletic"), { kind: "matched", value: "athletic" });
});

test("case-drift value heals to canonical value", () => {
  // "XS"/"Athletic"/"Slim" style legacy Title-Case data
  assert.deepEqual(resolveSelectValue(bodyType, "Athletic"), { kind: "matched", value: "athletic" });
  assert.deepEqual(resolveSelectValue(bodyType, "SLIM"), { kind: "matched", value: "slim" });
});

test("label-as-value heals to canonical value via case-insensitive label", () => {
  // stored "Dark brown" (label, different case) → "dark_brown"
  assert.deepEqual(resolveSelectValue(hairColor, "Dark brown"), { kind: "matched", value: "dark_brown" });
  assert.deepEqual(resolveSelectValue(hairColor, "Light Brown"), { kind: "matched", value: "light_brown" });
});

test("slugified label resolves when only spacing/case differs", () => {
  assert.deepEqual(resolveSelectValue(hairColor, "dark brown"), { kind: "matched", value: "dark_brown" });
});

test("orphaned/stale value is unmatchable (caller skips, does not abort)", () => {
  assert.deepEqual(resolveSelectValue(bodyType, "Amber"), { kind: "unmatchable" });
  assert.deepEqual(resolveSelectValue(bodyType, "msafa"), { kind: "unmatchable" });
});

test("non-select config passes through (no options to validate against)", () => {
  assert.deepEqual(resolveSelectValue({ input: "text" }, "anything"), { kind: "passthrough" });
  assert.deepEqual(resolveSelectValue(null, "anything"), { kind: "passthrough" });
});

test("empty raw resolves to empty (clearing a value)", () => {
  assert.deepEqual(resolveSelectValue(bodyType, ""), { kind: "matched", value: "" });
});

// ── matchLabelOption: System B (bare-label) vocabulary ──────────────────────
const bLabels = ["Slim", "Athletic", "Curvy", "Plus", "Muscular", "Other"];

test("matchLabelOption: mirrored slug resolves to the catalog label", () => {
  // A→B mirror: legacy slug "athletic" → catalog chip label "Athletic"
  assert.equal(matchLabelOption(bLabels, "athletic"), "Athletic");
  assert.equal(matchLabelOption(["Dark brown", "Light brown"], "dark_brown"), "Dark brown");
});

test("matchLabelOption: exact + case-insensitive label", () => {
  assert.equal(matchLabelOption(bLabels, "Athletic"), "Athletic");
  assert.equal(matchLabelOption(bLabels, "CURVY"), "Curvy");
});

test("matchLabelOption: no matching option returns null (caller skips)", () => {
  assert.equal(matchLabelOption(bLabels, "average"), null); // B has no "Average" (has "Plus")
  assert.equal(matchLabelOption(bLabels, ""), null);
});

test("labelForValue returns the option label_en for a value", () => {
  assert.equal(labelForValue(hairColor, "dark_brown"), "Dark Brown");
  assert.equal(labelForValue(hairColor, "nonexistent"), null);
});
