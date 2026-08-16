/**
 * choice-row.test.ts — the horizontal-only / max-5 policy, including the
 * negative case.
 *
 * A policy that is only ever tested with compliant input is not a policy; it
 * is a comment. The 6-option case below is the one that matters.
 *
 * Also pins the KIT SURFACE POLICY that keeps the field kit from becoming the
 * 21st pattern: no parchment, no khaki, no gold/rust, three font sizes, radii
 * from CHROME_RADII only.
 *
 * Runner: node:test + node:assert/strict.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { CHOICE_ROW_MAX_OPTIONS, choiceRowPolicyViolation } from "./choice-row";
import { FIELD_KIT, RETIRED_PALETTE } from "./tokens";
import { CHROME_RADII } from "../../kit/tokens";
import { resolveSearchTerms } from "./field-row";

const HERE = dirname(fileURLToPath(import.meta.url));

function opts(n: number) {
  return Array.from({ length: n }, (_, i) => ({ value: `o${i}`, label: `O${i}` }));
}

// ── The policy ─────────────────────────────────────────────────────────────

test("a compliant row (5 options) passes", () => {
  assert.equal(choiceRowPolicyViolation(opts(CHOICE_ROW_MAX_OPTIONS)), null);
});

test("counts below the ceiling pass", () => {
  for (let n = 1; n <= CHOICE_ROW_MAX_OPTIONS; n += 1) {
    assert.equal(choiceRowPolicyViolation(opts(n)), null, `${n} options should pass`);
  }
});

test("SIX options is a violation — the negative case", () => {
  const violation = choiceRowPolicyViolation(opts(6));
  assert.ok(violation, "6 options must be rejected by the policy");
  assert.match(violation!, /6 options/);
  assert.match(
    violation!,
    /GlyphTiles/,
    "the violation must name the right control to use instead, not just say no",
  );
});

test("a wildly over-long row is still a violation, with its real count", () => {
  const violation = choiceRowPolicyViolation(opts(11));
  assert.ok(violation);
  assert.match(violation!, /11 options/);
});

test("the violation message names the offending field when it can", () => {
  const violation = choiceRowPolicyViolation(opts(6), "Text transform");
  assert.match(violation!, /Text transform/);
});

test("zero options is a violation, not a silent empty row", () => {
  assert.ok(choiceRowPolicyViolation([]));
});

test("duplicate option values are a violation (ambiguous selection)", () => {
  const violation = choiceRowPolicyViolation([
    { value: "a" },
    { value: "b" },
    { value: "a" },
  ]);
  assert.ok(violation);
  assert.match(violation!, /duplicate/i);
});

test("ChoiceRow never forwards Segmented's fullWidth auto-fit grid mode", () => {
  // Horizontal ONLY is a source-level guarantee: fullWidth is the grid mode,
  // and forwarding it would let a choice row wrap into rows again.
  const body = code(readFileSync(join(HERE, "choice-row.tsx"), "utf8"));
  assert.ok(
    !/fullWidth/.test(body),
    "choice-row.tsx mentions fullWidth in code. It is Segmented's auto-fit grid " +
      "mode; forwarding it re-enables the wrapping this component exists to prevent.",
  );
});

// ── The search contract ────────────────────────────────────────────────────

test("search terms default to the label when none are given", () => {
  assert.deepEqual(resolveSearchTerms(undefined, "Corner radius"), ["Corner radius"]);
});

test("explicit search terms win over the label, so synonyms work", () => {
  assert.deepEqual(
    resolveSearchTerms(["rounded", "border radius"], "Corners"),
    ["rounded", "border radius"],
  );
});

test("a row with no text at all opts OUT of filtering rather than vanishing", () => {
  assert.deepEqual(
    resolveSearchTerms(undefined, null),
    [],
    "empty terms mean 'do not filter'; a control that disappears from search reads as missing",
  );
  assert.deepEqual(resolveSearchTerms([], undefined), []);
  assert.deepEqual(resolveSearchTerms("   ", undefined), []);
});

// ── The kit surface policy ─────────────────────────────────────────────────

function kitSources(): Array<{ name: string; src: string }> {
  return readdirSync(HERE)
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((name) => ({ name, src: readFileSync(join(HERE, name), "utf8") }));
}

/** Strip comments so doc-comments naming a banned color are not violations. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

test("the field kit contains no parchment or khaki (the palette it retires)", () => {
  for (const { name, src } of kitSources()) {
    // tokens.ts publishes RETIRED_PALETTE as data; that array is the guard's
    // own input, so it is exempt from being scanned as a usage.
    const body = name === "tokens.ts" ? code(src).split("RETIRED_PALETTE")[0] : code(src);
    for (const hex of RETIRED_PALETTE) {
      assert.ok(
        !body.toLowerCase().includes(hex.toLowerCase()),
        `${name} uses retired palette value ${hex}. The field kit is the beachhead of the palette retirement.`,
      );
    }
  }
});

test("the field kit contains no gold, rust or amber (owner rule)", () => {
  const banned =
    /#(b45309|d97706|f59e0b|92400e|78350f|c2410c|ea580c|9a3412|ca8a04|eab308|a16207)\b|\b(?:amber|yellow|orange)-\d{2,3}\b/i;
  for (const { name, src } of kitSources()) {
    assert.ok(!banned.test(code(src)), `${name} reintroduces a gold/rust/amber value`);
  }
});

test("the kit publishes exactly three font sizes", () => {
  assert.equal(
    Object.keys(FIELD_KIT.font).length,
    3,
    "nine font sizes in one column is the audit finding this kit answers; three is the ceiling",
  );
});

test("the kit publishes exactly one border color", () => {
  assert.equal(typeof FIELD_KIT.border, "string");
  assert.ok(
    !("borderStrong" in FIELD_KIT) && !("borderHover" in FIELD_KIT),
    "one edge color. Hover and focus are expressed with the accent, not a third taupe.",
  );
});

test("every kit radius comes from the CHROME_RADII scale", () => {
  const scale = Object.values(CHROME_RADII) as number[];
  for (const [name, value] of Object.entries(FIELD_KIT.radius)) {
    assert.ok(
      scale.includes(value),
      `FIELD_KIT.radius.${name} = ${value} is not on the CHROME_RADII scale (${scale.join(", ")})`,
    );
  }
});

test("the kit control height matches NumberUnit's, so the row shares a baseline", () => {
  const numberUnit = readFileSync(resolve(HERE, "../../kit/number-unit.tsx"), "utf8");
  assert.match(
    numberUnit,
    new RegExp(`height:\\s*${FIELD_KIT.size.control}\\b`),
    `NumberUnit no longer renders at ${FIELD_KIT.size.control}px; the preset chips and the ` +
      `exact input would sit on different baselines. Update FIELD_KIT.size.control with it.`,
  );
});

test("no kit file re-implements a numeric input instead of reusing NumberUnit", () => {
  for (const { name, src } of kitSources()) {
    if (name === "tokens.ts") continue;
    assert.ok(
      !/<input[^>]*inputMode=["']decimal/.test(code(src)),
      `${name} hand-rolls a numeric input. Reuse NumberUnit; a second numeric ` +
        `control is how a kit becomes the 21st pattern.`,
    );
  }
});
