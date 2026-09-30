/**
 * Release 2.5, PL-1 and PL-2: the Orchid palette and the one-colour custom
 * accent. The accent is derived (tint, page, line, text-safe accent, button
 * label), contrast is checked by measurement, and the text-safe accent is a
 * DERIVED token like `color.primary-on`: a stored value can never win.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { contrastRatio } from "@/lib/site-admin/tokens/contrast-pair";
import { designTokensToCssVars } from "@/lib/site-admin/tokens/resolve";
import { TOKEN_REGISTRY } from "@/lib/site-admin/tokens/registry";
import { readableAccentText } from "@/lib/site-admin/tokens/contrast-pair";
import { getGalleryDesign, galleryPaletteLookTokens } from "./theme-catalog/gallery-meta";
import { customAccentNote, customAccentTokenPatch, deriveCustomAccent, normalizeAccentHex } from "./custom-accent";

test("Orchid is a Maison v2 palette next to the others, with its own tokens and both names", () => {
  const design = getGalleryDesign("maison-v2")!;
  const keys = design.palettes.map((p) => p.key);
  assert.deepEqual(keys, ["rose", "blush", "orchid", "noir-rose", "porcelain", "sage"], "Orchid added, the extra two kept");
  const orchid = design.palettes.find((p) => p.key === "orchid")!;
  assert.equal(orchid.name.en, "Orchid");
  assert.equal(orchid.name.es, "Orquídea");
  const tokens = galleryPaletteLookTokens("maison-v2", "orchid")!;
  assert.equal(tokens["color.accent"], tokens["color.primary"], "accent and primary agree (the booking sheet fills with primary)");
  assert.ok(tokens["color.blush"], "tint");
  // The accent reads as text on the page and the surface.
  assert.ok((contrastRatio(tokens["color.accent"]!, tokens["color.background"]!) ?? 0) >= 4.5);
  assert.ok((contrastRatio(tokens["color.primary-on"]!, tokens["color.primary"]!) ?? 0) >= 4.5);
});

test("the custom accent derives tint, page, line and text from one colour, exactly as the mockup mixes them", () => {
  const p = deriveCustomAccent("#2E6F8E")!;
  assert.equal(p.accent, "#2e6f8e");
  // 88% / 97.5% / 84% of the way to white.
  assert.equal(p.tint, "#e6eef1");
  assert.equal(p.page, "#fafbfc");
  assert.equal(p.line, "#dee8ed");
  assert.equal(p.on, "#ffffff");
  assert.ok(p.textContrast >= 4.5);
  assert.equal(normalizeAccentHex("#abc"), "#aabbcc");
  assert.equal(normalizeAccentHex("nope"), null);
  assert.equal(deriveCustomAccent("nope"), null);
});

test("a pale accent is darkened as TEXT only, and its button label goes dark", () => {
  const pale = deriveCustomAccent("#f4c542")!;
  assert.equal(pale.adjusted, true);
  assert.notEqual(pale.text, pale.accent);
  assert.ok((contrastRatio(pale.text, "#ffffff") ?? 0) >= 4.5, "text passes on white");
  assert.equal(pale.on, "#161214", "white would not read on a pale accent");
  assert.equal(pale.accent, "#f4c542", "the buttons keep the colour she picked");
  // An accent that already reads is left alone.
  const deep = deriveCustomAccent("#7a2f8f")!;
  assert.equal(deep.adjusted, false);
  assert.equal(deep.text, deep.accent);
});

test("the notes (EN + ES) report the ratio, name the darker text colour, and use no em dashes", () => {
  const pale = deriveCustomAccent("#f4c542")!;
  const deep = deriveCustomAccent("#7a2f8f")!;
  for (const locale of ["en", "es"] as const) {
    for (const p of [pale, deep]) {
      const note = customAccentNote(p, locale);
      assert.match(note, /\d\.\d:1/);
      assert.doesNotMatch(note, /—|–/);
    }
  }
  assert.match(customAccentNote(pale, "en"), /darker #[0-9a-f]{6}/);
  assert.match(customAccentNote(pale, "es"), /más oscuro/);
  assert.match(customAccentNote(deep, "es"), /Texto del botón: blanco/);
});

test("the token patch writes registry colours only, and leaves a dark site dark", () => {
  const light = customAccentTokenPatch("#2E6F8E", { "color.background": "#ffffff" })!;
  assert.deepEqual(Object.keys(light).sort(), ["color.accent", "color.background", "color.blush", "color.line", "color.primary"]);
  for (const key of Object.keys(light)) assert.ok(TOKEN_REGISTRY[key], `${key} is a registry token`);
  assert.ok(!("color.primary-on" in light) && !("color.accent-text" in light), "derived tokens are never written");
  const dark = customAccentTokenPatch("#E3487E", { "color.background": "#151012" })!;
  assert.deepEqual(Object.keys(dark).sort(), ["color.accent", "color.blush", "color.primary"], "page ground and lines stay dark");
  assert.equal(customAccentTokenPatch("red", {}), null);
});

test("color.accent-text is DERIVED: readable on the ground, dark sites lighten, unknown accents leave the var unset", () => {
  const vars = designTokensToCssVars({ "color.accent": "#f4c542", "color.background": "#ffffff", "color.surface-raised": "#ffffff" });
  const text = vars["--token-color-accent-text"]!;
  assert.ok(text && text !== "#f4c542");
  assert.ok((contrastRatio(text, "#ffffff") ?? 0) >= 4.5);
  // A dark page: the accent is LIGHTENED until it reads.
  const dark = designTokensToCssVars({ "color.accent": "#6b2a45", "color.background": "#151012", "color.surface-raised": "#1e171a" });
  assert.ok((contrastRatio(dark["--token-color-accent-text"]!, "#1e171a") ?? 0) >= 4.5);
  // An unmeasurable accent: the var is NOT emitted, so the stylesheet falls back to the raw accent.
  const keyword = designTokensToCssVars({ "color.accent": "currentColor", "color.primary": "var(--x)" });
  assert.equal(keyword["--token-color-accent-text"], undefined);
  // A stored value can never win over the derivation.
  const forced = designTokensToCssVars({ "color.accent": "#7a2f8f", "color.accent-text": "#ff00ff", "color.background": "#ffffff" });
  assert.equal(forced["--token-color-accent-text"], "#7a2f8f");
  assert.equal(TOKEN_REGISTRY["color.accent-text"]!.agencyConfigurable, false);
});

test("readableAccentText: already-readable accents are returned as is, at most 14 steps", () => {
  assert.equal(readableAccentText("#7a2f8f", "#ffffff"), "#7a2f8f");
  assert.equal(readableAccentText("nope", "#ffffff"), null);
  assert.equal(readableAccentText("#7a2f8f", "nope"), null);
  const pale = readableAccentText("#ffff00", "#ffffff")!;
  assert.ok((contrastRatio(pale, "#ffffff") ?? 0) >= 4.5);
});
