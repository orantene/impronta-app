/**
 * TUL-549 — header nav / wordmark contrast on every LIGHT theme preset.
 *
 * The header's secondary text is `--site-header-soft-ink` (82% ink mixed toward the bar, token-presets.css), the bar is
 * `surface-raised` (solid) or 92% `surface-raised` over the page (surface), and a transparent header that is NOT over a
 * dark hero sits on a page-background scrim. This test recomputes those colours from each preset's token values and
 * asserts WCAG AA 4.5:1 for nav text, the wordmark and the inactive ES/EN code. Browser pixels are checked in QA.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import { GALLERY_DESIGNS } from "@/lib/talent-site/theme-catalog/gallery-meta";
import { MAISON_PALETTES, maisonPaletteLookTokens } from "@/lib/talent-site/theme-catalog/maison/seed";
import { THEME_PRESETS } from "@/lib/site-admin/presets/theme-presets";

import { contrastRatio, parseColor, relativeLuminance } from "./contrast";

const AA = 4.5;
const CSS = readFileSync(resolve(process.cwd(), "src/app/token-presets.css"), "utf8");

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => {
  const c = parseColor(hex);
  assert.ok(c, `unparseable colour ${hex}`);
  return c;
};
const hex = (c: Rgb) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
/** CSS `color-mix(in srgb, a pct%, b)`. */
const mix = (a: Rgb, pct: number, b: Rgb): Rgb => a.map((v, i) => (v * pct) / 100 + (b[i]! * (100 - pct)) / 100) as Rgb;

type Case = { label: string; background: string; surface: string; ink: string };
const cases: Case[] = [];
const lightEnough = (bg: string) => relativeLuminance(rgb(bg)) > 0.4;

for (const key of Object.keys(MAISON_PALETTES)) {
  const t = maisonPaletteLookTokens(key as keyof typeof MAISON_PALETTES);
  cases.push({ label: `maison v1 / ${key}`, background: t["color.background"]!, surface: t["color.surface-raised"]!, ink: t["color.ink"]! });
}
for (const d of GALLERY_DESIGNS) {
  for (const p of d.palettes) {
    if (p.dark) continue;
    cases.push({ label: `${d.slug} / ${p.key}`, background: p.page, surface: p.section, ink: p.text });
  }
}
for (const preset of THEME_PRESETS) {
  const t = preset.tokens;
  const background = t["color.background"];
  const ink = t["color.ink"];
  if (!background || !ink || !lightEnough(background)) continue;
  cases.push({ label: `preset ${preset.slug}`, background, surface: t["color.surface-raised"] ?? "#ffffff", ink });
}
const light = cases.filter((c) => lightEnough(c.background));

describe("TUL-549 light theme header contrast (computed from token values)", () => {
  it("covers Maison v1, the gallery designs and the light platform presets", () => {
    assert.ok(light.length >= 15, `only ${light.length} light cases`);
    assert.ok(light.some((c) => c.label.startsWith("maison v1")));
    assert.ok(light.some((c) => c.label.startsWith("preset ")));
  });

  for (const c of light) {
    const bg = rgb(c.background);
    const surface = rgb(c.surface);
    const ink = rgb(c.ink);
    const bars: Array<[string, Rgb]> = [
      ["solid bar", surface],
      ["surface bar (92% over page)", mix(surface, 92, bg)],
      ["transparent bar on page-background scrim", bg],
    ];
    for (const [name, bar] of bars) {
      it(`${c.label}: ${name}: nav text, wordmark, ES/EN clear AA`, () => {
        const soft = mix(ink, 82, surface); // --site-header-soft-ink (nav, inactive ES/EN, tagline)
        const nav = contrastRatio(hex(soft), hex(bar));
        const word = contrastRatio(hex(ink), hex(bar));
        assert.ok(nav != null && nav >= AA, `nav ${hex(soft)} on ${hex(bar)} = ${nav?.toFixed(2)}`);
        assert.ok(word != null && word >= AA, `wordmark ${hex(ink)} on ${hex(bar)} = ${word?.toFixed(2)}`);
      });
    }
  }
});

describe("TUL-549 header CSS wiring", () => {
  it("nav links, inactive ES/EN and tagline use the soft ink at full opacity, not faded ink or muted", () => {
    assert.match(CSS, /\.site-header \{ --site-header-soft-ink: color-mix\(in srgb, var\(--token-color-ink, #111\) 82%, var\(--token-color-surface-raised, #fff\)\); \}/);
    assert.match(CSS, /\.site-header__nav-link \{ color: var\(--site-header-soft-ink\);[^}]*opacity: 1;/);
    assert.doesNotMatch(CSS, /\.site-header__nav-link \{[^}]*opacity: 0\.85/);
    assert.doesNotMatch(CSS, /site-header__lang-code \{[^}]*opacity: 0\.55/);
    assert.doesNotMatch(CSS, /site-header__lang-sep \{[^}]*opacity: 0\.55/);
    assert.doesNotMatch(CSS, /site-header__(?:nav-link|contact|brand-tagline)[^{]*\{[^}]*--token-color-muted/);
  });

  it("a transparent talent header that is NOT over a dark hero gets a page-background scrim and ink, never the dark scrim", () => {
    const rule =
      /\[data-talent-max-site-header\]:not\(\[data-over-hero="true"\]\) \.site-header\[data-tone="transparent"\]:not\(\[data-scrolled="true"\]\) \{\s*background-image: linear-gradient\([^;]*--token-color-background[^;]*;\s*color: var\(--token-color-ink, #111\);/;
    assert.match(CSS, rule);
    // It must come after the dark scrim so equal-or-lower specificity cannot undo it, and the dark scrim stays for agency/over-hero.
    assert.ok(CSS.indexOf("rgba(10, 9, 12, 0.55)") < CSS.search(rule));
  });
});
