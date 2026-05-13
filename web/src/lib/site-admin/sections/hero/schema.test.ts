/**
 * P7B follow-through — Hero v1 schema round-trip tests.
 *
 * The layout variant (centered / split-left / split-right) was added as
 * an optional enum on heroSchemaV1. These tests lock the back-compat
 * guarantee: existing rows without the field parse as before, and the
 * field round-trips through parse + safeParse without coercion drift.
 *
 * Bonus coverage: the existing mood + overlay enums get explicit
 * round-trip assertions so a future enum widening can't accidentally
 * break old saved drafts.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { heroSchemaV1 } from "./schema";

const MINIMAL_HERO = {
  headline: "Hello",
} as const;

test("hero schema parses a minimal headline without layout/mood/overlay", () => {
  const parsed = heroSchemaV1.parse(MINIMAL_HERO);
  assert.equal(parsed.headline, "Hello");
  assert.equal(parsed.layout, undefined);
  assert.equal(parsed.mood, undefined);
  assert.equal(parsed.overlay, undefined);
});

test("hero schema round-trips layout='centered'", () => {
  const input = { ...MINIMAL_HERO, layout: "centered" as const };
  const parsed = heroSchemaV1.parse(input);
  assert.equal(parsed.layout, "centered");
});

test("hero schema round-trips layout='split-left'", () => {
  const input = { ...MINIMAL_HERO, layout: "split-left" as const };
  const parsed = heroSchemaV1.parse(input);
  assert.equal(parsed.layout, "split-left");
});

test("hero schema round-trips layout='split-right'", () => {
  const input = { ...MINIMAL_HERO, layout: "split-right" as const };
  const parsed = heroSchemaV1.parse(input);
  assert.equal(parsed.layout, "split-right");
});

test("hero schema rejects unknown layout values", () => {
  const input = { ...MINIMAL_HERO, layout: "diagonal" as unknown as "centered" };
  const result = heroSchemaV1.safeParse(input);
  assert.equal(result.success, false);
});

test("legacy hero rows (no layout field) survive parse → stringify → parse", () => {
  // Simulates a row written before the layout field existed: parse it,
  // serialize, re-parse. The undefined layout must stay undefined and
  // not become null or "centered" through any coercion.
  const parsed = heroSchemaV1.parse(MINIMAL_HERO);
  const json = JSON.stringify(parsed);
  const reparsed = heroSchemaV1.parse(JSON.parse(json));
  assert.equal(reparsed.layout, undefined);
  assert.equal(reparsed.headline, "Hello");
});

test("layout coexists with mood + overlay without interference", () => {
  const input = {
    ...MINIMAL_HERO,
    layout: "split-right" as const,
    mood: "editorial" as const,
    overlay: "aurora" as const,
  };
  const parsed = heroSchemaV1.parse(input);
  assert.equal(parsed.layout, "split-right");
  assert.equal(parsed.mood, "editorial");
  assert.equal(parsed.overlay, "aurora");
});

test("layout coexists with slides[] without interference", () => {
  const input = {
    ...MINIMAL_HERO,
    layout: "split-left" as const,
    slides: [
      { eyebrow: "First slide" },
      { headline: "Second slide" },
    ],
  };
  const parsed = heroSchemaV1.parse(input);
  assert.equal(parsed.layout, "split-left");
  assert.equal(parsed.slides?.length, 2);
});
