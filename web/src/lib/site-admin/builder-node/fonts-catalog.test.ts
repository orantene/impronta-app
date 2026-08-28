/**
 * fonts-catalog.test.ts — the full Google Fonts catalogue + the usage-aware
 * href builder.
 *
 * The catalogue is GENERATED data (scripts/generate-google-fonts-catalog.mjs),
 * so the integrity tests here are what make a bad regeneration fail CI instead
 * of 400-ing every font on every storefront: css2 rejects the entire
 * stylesheet when one family/weight tuple is wrong, which is why clamping and
 * unknown-family skipping are load-bearing, not niceties.
 *
 * Run: node_modules/.bin/tsx --test src/lib/site-admin/builder-node/fonts-catalog.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildGoogleFontsHrefFromUsage,
  clampWeightForFamily,
  cssFamilyForGoogleFont,
  getGoogleFontMeta,
  loadGoogleFontsCatalog,
} from "./fonts-catalog";
import { BUILDER_FONT_REGISTRY } from "./fonts-registry";

// ── catalogue integrity ────────────────────────────────────────────────────

test("the catalogue is the FULL library, not a curated list", () => {
  const catalog = loadGoogleFontsCatalog();
  assert.ok(
    catalog.length > 1500,
    `expected 1500+ families, got ${catalog.length} — a truncated regeneration?`,
  );
});

test("every entry parses into weights and a category", () => {
  for (const meta of loadGoogleFontsCatalog()) {
    assert.ok(meta.family.length > 0);
    assert.ok(["sans", "serif", "display", "script", "mono"].includes(meta.category));
    assert.ok(
      meta.weights.length > 0 || meta.italicWeights.length > 0,
      `${meta.family} has no instances`,
    );
    for (const w of [...meta.weights, ...meta.italicWeights]) {
      assert.ok(w >= 1 && w <= 1000, `${meta.family} weight ${w} out of range`);
    }
    if (meta.vf) assert.ok(meta.vf.min < meta.vf.max, `${meta.family} bad vf range`);
  }
});

test("every registry google face exists in the catalogue (registry ⊂ catalogue)", () => {
  for (const font of BUILDER_FONT_REGISTRY) {
    if (font.source !== "google") continue;
    const meta = getGoogleFontMeta(font.family);
    assert.ok(meta, `${font.family} is in the curated registry but not the catalogue`);
  }
});

test("popularity ordering puts household names in the front ranks", () => {
  const catalog = loadGoogleFontsCatalog();
  const top = catalog.slice(0, 30).map((f) => f.family);
  assert.ok(top.includes("Roboto"), `Roboto not in the top 30: ${top.join(", ")}`);
});

test("lookup is case-insensitive and unknown families are null", () => {
  assert.ok(getGoogleFontMeta("roboto"));
  assert.ok(getGoogleFontMeta("  \"Roboto\"  "));
  assert.equal(getGoogleFontMeta("Definitely Not A Font 9000"), null);
});

// ── weight clamping ────────────────────────────────────────────────────────

test("clamping snaps to the nearest shipped weight for static families", () => {
  const italiana = getGoogleFontMeta("Italiana");
  assert.ok(italiana);
  assert.equal(italiana.vf, null);
  assert.deepEqual(italiana.weights, [400]);
  assert.equal(clampWeightForFamily(italiana, 700), 400);
  assert.equal(clampWeightForFamily(italiana, 100), 400);
});

test("clamping respects a variable family's axis range", () => {
  const vf = loadGoogleFontsCatalog().find((f) => f.vf && f.vf.min > 100);
  assert.ok(vf?.vf, "no variable family with a min above 100?");
  assert.equal(clampWeightForFamily(vf, 1), vf.vf.min);
  assert.equal(clampWeightForFamily(vf, 1000), vf.vf.max);
  assert.equal(clampWeightForFamily(vf, vf.vf.min + 1), vf.vf.min + 1);
});

// ── href building ──────────────────────────────────────────────────────────

test("a variable family is requested as ONE range, not N instances", () => {
  const roboto = getGoogleFontMeta("Roboto");
  assert.ok(roboto?.vf);
  const href = buildGoogleFontsHrefFromUsage([
    { value: '"Roboto", sans-serif', weights: [300, 500, 700] },
  ]);
  assert.ok(href);
  assert.match(href, /family=Roboto:wght@300\.\.700/);
  assert.match(href, /display=swap/);
});

test("a static family gets exact clamped instances, deduped and sorted", () => {
  const href = buildGoogleFontsHrefFromUsage([
    // Italiana ships 400 only — every wanted weight must clamp to it.
    { value: '"Italiana", Georgia, serif', weights: [700, 400, 900] },
  ]);
  assert.equal(href, "https://fonts.googleapis.com/css2?family=Italiana:wght@400&display=swap");
});

test("italics are requested only when used AND truly available", () => {
  const withItalics = buildGoogleFontsHrefFromUsage([
    { value: "Lora", weights: [400, 700], italic: true },
  ]);
  assert.ok(withItalics);
  assert.match(withItalics, /family=Lora:ital,wght@/);

  // Italiana has no italic instances: requesting italics must not emit an
  // ital axis (css2 would 400 the stylesheet).
  const noItalics = buildGoogleFontsHrefFromUsage([
    { value: "Italiana", weights: [400], italic: true },
  ]);
  assert.equal(noItalics, "https://fonts.googleapis.com/css2?family=Italiana:wght@400&display=swap");
});

test("unknown families (tenant uploads, garbage) never reach Google", () => {
  const href = buildGoogleFontsHrefFromUsage([
    { value: '"Suisse Intl", system-ui, sans-serif', weights: [400] },
    { value: "token:typography.heading-font-family" },
    { value: "var(--site-heading-font)" },
    { value: "sans-serif" },
  ]);
  assert.equal(href, null);
});

test("bundled registry faces are skipped (self-hosted via next/font/local)", () => {
  const href = buildGoogleFontsHrefFromUsage([
    { value: '"Playfair Display", var(--font-playfair-display), Georgia, serif' },
    { value: '"Inter", var(--font-inter-body), system-ui, sans-serif' },
  ]);
  assert.equal(href, null);
});

test("one combined href for many families; each family appears once", () => {
  const href = buildGoogleFontsHrefFromUsage([
    { value: "Lora", weights: [400] },
    { value: '"Lora", Georgia, serif', weights: [700] },
    { value: "Italiana", weights: [400] },
  ]);
  assert.ok(href);
  assert.equal(href.match(/family=Lora/g)?.length, 1);
  assert.match(href, /family=Italiana/);
});

test("css family values carry a real fallback stack", () => {
  const meta = getGoogleFontMeta("Lora");
  assert.ok(meta);
  assert.equal(cssFamilyForGoogleFont(meta), '"Lora", Georgia, serif');
  const script = loadGoogleFontsCatalog().find((f) => f.category === "script");
  assert.ok(script);
  assert.match(cssFamilyForGoogleFont(script), /cursive$/);
});
