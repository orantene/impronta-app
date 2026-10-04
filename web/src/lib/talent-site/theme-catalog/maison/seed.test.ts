/**
 * Maison seed module — Phase A.
 *
 * Proves the approved JSON is the only source for palette hexes and that the
 * five palettes + starter counts match the product pack.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  MAISON_DEFAULT_PALETTE_KEY,
  MAISON_PALETTE_ORDER,
  MAISON_PALETTES,
  MAISON_SEED,
  MAISON_STARTER_COUNTS,
  MAISON_THEME_KEY,
  maisonPaletteLookTokens,
} from "./seed";

test("maison seed: theme key and five palettes in order", () => {
  assert.equal(MAISON_THEME_KEY, "maison");
  assert.deepEqual(MAISON_PALETTE_ORDER, ["pink", "pearl", "lilac", "sand", "peach"]);
  assert.equal(MAISON_DEFAULT_PALETTE_KEY, "pink");
});

test("maison seed: pink matches book-jorgelina rose tokens", () => {
  const pink = MAISON_PALETTES.pink;
  assert.equal(pink.page, "#FFFFFF");
  assert.equal(pink.section, "#FFF5F8");
  assert.equal(pink.rule, "#EDE8EB");
  assert.equal(pink.text, "#241F26");
  assert.equal(pink.accent, "#A82458");
  assert.equal(pink.on_accent, "#FFFFFF");
});

test("maison seed: starter content counts are 6+4+3=13", () => {
  assert.equal(MAISON_STARTER_COUNTS.services, 6);
  assert.equal(MAISON_STARTER_COUNTS.faq_prompts, 4);
  assert.equal(MAISON_STARTER_COUNTS.section_text, 3);
  assert.equal(MAISON_STARTER_COUNTS.total, 13);
  assert.equal(MAISON_SEED.demo_nails.starter_content.images_licensed_for_reuse, false);
});

test("maison seed: look tokens map page/section/rule/text/accent", () => {
  const tokens = maisonPaletteLookTokens("lilac");
  assert.equal(tokens["color.background"], "#FFFFFF");
  assert.equal(tokens["color.surface-raised"], "#F6F0F8");
  assert.equal(tokens["color.primary"], "#6A2C70");
  assert.equal(tokens["color.ink"], "#261E2B");
});
