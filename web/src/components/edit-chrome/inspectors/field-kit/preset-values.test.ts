/**
 * preset-values.test.ts — the field kit's HONESTY GUARD.
 *
 * D9 item 1 says a preset chip must display its real value. P1 enforced that
 * with a parity suite that read `render.tsx` as TEXT, because the renderer's
 * scale maps were module-private and P1 could not edit existing files. P2
 * exported the scales (`@/lib/site-admin/builder-node/style-scales`) and
 * `preset-values.ts` now DERIVES every number from that import, so parity is
 * enforced by the module graph and the text-parsing guard is deleted.
 *
 * What remains is the SEMANTICS suite: the caption formatter and `matchPreset`
 * behave as the D9 contract (and the re-lighting decision) promise, and the
 * derivation itself produces the numbers the renderer's scales imply.
 *
 * Runner: node:test + node:assert/strict.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BORDER_STYLE_PRESETS,
  GAP_PRESETS,
  ICON_SIZE_PRESETS,
  MAX_WIDTH_PRESETS,
  RADIUS_PRESETS,
  SHADOW_PRESETS,
  SPACING_PRESETS,
  SPACING_PRESETS_SHIPPED,
  TEXT_SIZE_PRESETS,
  TEXT_SIZE_PRESETS_PARAGRAPH,
  matchPreset,
  presetById,
  presetCaption,
  remToPx,
} from "./preset-values";

// ── 1. Derivation sanity ─────────────────────────────────────────────────────

test("every renderer scale id has a chip entry with a resolved value", () => {
  // The tables are built by iterating the imported scale maps, so a missing id
  // would mean the derivation silently dropped an entry.
  for (const [table, ids] of [
    [SPACING_PRESETS, ["", "none", "s", "m", "l", "xl"]],
    [RADIUS_PRESETS, ["", "none", "sm", "md", "lg", "pill"]],
    [MAX_WIDTH_PRESETS, ["", "narrow", "reading", "wide", "full"]],
    [GAP_PRESETS, ["s", "m", "l"]],
    [ICON_SIZE_PRESETS, ["sm", "md", "lg", "xl"]],
    [TEXT_SIZE_PRESETS, ["", "sm", "md", "lg", "xl", "display"]],
  ] as const) {
    for (const id of ids) {
      assert.ok(
        presetById(table, id),
        `expected an entry for preset id "${id}"`,
      );
    }
  }
});

test("gap M and spacing M are genuinely different numbers", () => {
  // The exact confusion D9 exists to end: two chips both labelled "M".
  const gapM = presetById(GAP_PRESETS, "m");
  const spacingM = presetById(SPACING_PRESETS, "m");
  assert.ok(gapM?.numeric && spacingM?.numeric);
  assert.notEqual(
    gapM!.numeric!.value,
    spacingM!.numeric!.value,
    "If these ever converge, delete this test — but check the renderer first.",
  );
  assert.equal(gapM!.numeric!.value, 20);
  assert.equal(spacingM!.numeric!.value, 24);
});

test("paragraph text tiers really are the smaller clamps", () => {
  const headingLg = presetById(TEXT_SIZE_PRESETS, "lg")!;
  const paragraphLg = presetById(TEXT_SIZE_PRESETS_PARAGRAPH, "lg")!;
  assert.ok(headingLg.rangePx && paragraphLg.rangePx);
  assert.ok(
    paragraphLg.rangePx![1] < headingLg.rangePx![1],
    "the paragraph override must resolve smaller than the heading clamp",
  );
});

// ── 2. Captions ─────────────────────────────────────────────────────────────

test("every length preset produces a caption (D9 item 1)", () => {
  for (const table of [SPACING_PRESETS, RADIUS_PRESETS, GAP_PRESETS, ICON_SIZE_PRESETS]) {
    for (const preset of table) {
      if (preset.kind !== "length") continue;
      assert.ok(
        presetCaption(preset),
        `"${preset.label}" is a length preset with no caption — it would ship ` +
          `as a bare letter, which is exactly what D9 forbids.`,
      );
    }
  }
});

test("the M padding chip captions as 24, not as nothing", () => {
  assert.equal(presetCaption(presetById(SPACING_PRESETS, "m")!), "24");
  assert.equal(presetCaption(presetById(SPACING_PRESETS, "s")!), "12");
  assert.equal(presetCaption(presetById(SPACING_PRESETS, "l")!), "48");
});

test("the unset preset has no caption — it has no honest value to show", () => {
  assert.equal(presetCaption(presetById(SPACING_PRESETS, "")!), null);
});

test("fluid presets caption as a range, never as a fake single number", () => {
  const lg = presetById(TEXT_SIZE_PRESETS, "lg")!;
  assert.equal(lg.kind, "fluid");
  assert.equal(lg.numeric, null, "a clamp() has no single number to fill an input with");
  assert.equal(presetCaption(lg), "21.6-36");
});

test("shadow presets do not try to caption their whole CSS string", () => {
  for (const preset of SHADOW_PRESETS) {
    if (preset.kind === "unset") continue;
    assert.equal(
      presetCaption(preset),
      null,
      "a 60-character box-shadow cannot be a 10.5px caption; the glyph shows it",
    );
  }
});

test("short keyword presets do caption (border styles)", () => {
  assert.equal(presetCaption(presetById(BORDER_STYLE_PRESETS, "dashed")!), "dashed");
});

test("pill is a keyword, so it never fills the exact input with 999", () => {
  const pill = presetById(RADIUS_PRESETS, "pill")!;
  assert.equal(pill.numeric, null);
  assert.ok(pill.variantNote, "the 999px sentinel must be explained, not silently dropped");
});

// ── 3. matchPreset — the re-lighting decision ───────────────────────────────

test("matchPreset re-lights a chip when the typed value equals its preset", () => {
  const hit = matchPreset(SPACING_PRESETS, { value: 24, unit: "px" });
  assert.equal(hit?.id, "m");
});

test("matchPreset does not match across units — 24rem is not the M preset", () => {
  assert.equal(matchPreset(SPACING_PRESETS, { value: 24, unit: "rem" }), null);
});

test("matchPreset returns null for a value between presets (true custom)", () => {
  assert.equal(matchPreset(SPACING_PRESETS, { value: 25, unit: "px" }), null);
});

test("matchPreset returns null when there is no value at all", () => {
  assert.equal(matchPreset(SPACING_PRESETS, null), null);
});

// ── 4. Odds and ends ────────────────────────────────────────────────────────

test("remToPx uses the 16px root the renderer assumes", () => {
  assert.equal(remToPx(0.75), 12);
  assert.equal(remToPx(1.5), 24);
  assert.equal(remToPx(4.5), 72);
});

test("the shipped spacing table omits xl, which has never had a chip", () => {
  assert.equal(presetById(SPACING_PRESETS_SHIPPED, "xl"), null);
  assert.ok(presetById(SPACING_PRESETS, "xl"), "but the honest table still knows about it");
});
