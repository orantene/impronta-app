/**
 * The accent family never lands unreadable.
 *
 * Found on Jorg Beauty QA: a stale page-level accent (a pale pink left by a clone) outranked the
 * Rosé palette after a design switch, so "Ver servicios" was white on pale pink and the eyebrow
 * and italic words washed out. Three guarantees, for every design:
 *  1. a page cannot repaint a colour the site's palette sets;
 *  2. `accent-on` (the foreground of an accent fill) always meets AA against the accent;
 *  3. `accent-text` (eyebrow, italic words) always meets AA against the page surface, and the
 *     design CSS actually uses both.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { EDITORIAL_TYPE_SYSTEM_CSS } from "@/lib/talent-site/theme-catalog/collection/design-type-system";
import { EDITORIAL_SOFT_CHROME_CSS } from "@/lib/talent-site/theme-catalog/collection/design-type-system-soft";
import { resolveEffectiveSiteTokens } from "@/lib/talent-site/site-theme-tokens";

import { contrastRatio } from "./contrast-pair";
import { designTokensToCssVars } from "./resolve";

const ROSE = {
  "color.ink": "#241417",
  "color.line": "#EFDFE3",
  "color.blush": "#FBE6EC",
  "color.muted": "#7B6468",
  "color.accent": "#B3174A",
  "color.primary": "#B3174A",
  "color.background": "#FCF7F7",
  "color.surface-raised": "#FFFFFF",
};
const STALE_PAGE = {
  "color.ink": "#241F26",
  "color.accent": "#F4D7E2",
  "color.primary": "#A82458",
  "color.background": "#FFFFFF",
  "color.surface-raised": "#FFF5F8",
  "typography.heading-font-family": "Fraunces",
};

test("a stale page accent cannot repaint the palette the site chose (the Jorg Beauty case)", () => {
  const out = resolveEffectiveSiteTokens(STALE_PAGE, ROSE, {});
  for (const k of ["color.accent", "color.primary", "color.ink", "color.background", "color.surface-raised"] as const) {
    assert.equal(out[k], ROSE[k], k);
  }
  // Non-colour page overrides still apply.
  assert.equal(out["typography.heading-font-family"], "Fraunces");
});

test("page colours still apply where the site sets none (older sites keep working)", () => {
  const out = resolveEffectiveSiteTokens({ "color.accent": "#112233", "color.ink": "#000000" }, { "color.accent": "#B3174A" }, {});
  assert.equal(out["color.accent"], "#B3174A", "the site's accent wins");
  assert.equal(out["color.ink"], "#000000", "the site sets no ink, so the page's applies");
  // No site tokens at all: the page map is the whole palette, as before.
  assert.deepEqual(resolveEffectiveSiteTokens({ "color.accent": "#112233" }, {}, { "color.accent": "#ffffff" }), { "color.accent": "#112233" });
});

test("accent-on: white or ink text on the accent fill is always AA, for any accent", () => {
  const accents = [
    "#F4D7E2", "#FBE6EC", "#FFE4B5", "#FFFF00", "#7FFFD4", "#B3174A", "#A82458", "#C0627A", "#808080",
    "#777777", "#0EA5E9", "#22C55E", "#F59E0B", "#111111", "#FFFFFF", "#E9D5FF", "#6D28D9",
  ];
  for (const accent of accents) {
    const vars = designTokensToCssVars({ "color.accent": accent, "color.primary": "#A82458", "color.background": "#FFFFFF" });
    const on = vars["--token-color-accent-on"];
    assert.ok(on, `accent-on exists for ${accent}`);
    assert.ok((contrastRatio(on!, accent) ?? 0) >= 4.5, `${accent}: ${on} on it is ${contrastRatio(on!, accent)}`);
  }
});

test("the pale pink: ink text on the fill (not white), and a darkened text-safe accent for eyebrows", () => {
  const vars = designTokensToCssVars({
    "color.accent": "#F4D7E2",
    "color.primary": "#A82458",
    "color.background": "#FFFFFF",
    "color.surface-raised": "#FFF5F8",
  });
  assert.notEqual(vars["--token-color-accent-on"]!.toLowerCase(), "#ffffff", "white on pale pink is the bug");
  assert.ok((contrastRatio(vars["--token-color-accent-on"]!, "#F4D7E2") ?? 0) >= 4.5);
  const text = vars["--token-color-accent-text"]!;
  assert.notEqual(text.toLowerCase(), "#f4d7e2", "the raw pale accent is not text");
  assert.ok((contrastRatio(text, "#FFF5F8") ?? 0) >= 4.5, `accent-text ${text} on the surface`);
  assert.ok((contrastRatio(text, "#FFFFFF") ?? 0) >= 4.5, "and on white");
});

test("accent-text is AA on the surface for a spread of accents, light and dark grounds", () => {
  for (const ground of ["#FFFFFF", "#FCF7F7", "#111111"]) {
    for (const accent of ["#F4D7E2", "#B3174A", "#FFE4B5", "#22C55E", "#0EA5E9", "#6D28D9"]) {
      const vars = designTokensToCssVars({ "color.accent": accent, "color.primary": accent, "color.surface-raised": ground });
      const text = vars["--token-color-accent-text"]!;
      assert.ok((contrastRatio(text, ground) ?? 0) >= 4.5, `${accent} on ${ground} -> ${text}`);
    }
  }
});

test("no measurable accent leaves both derived vars unset (the cascade is untouched)", () => {
  const vars = designTokensToCssVars({ "color.accent": "var(--x)", "color.primary": "linear-gradient(red, blue)" });
  assert.equal(vars["--token-color-accent-on"], undefined);
  assert.equal(vars["--token-color-accent-text"], undefined);
});

test("the design CSS fills with the accent and prints accent-on on it; eyebrows and italic words use accent-text", () => {
  const css = `${EDITORIAL_TYPE_SYSTEM_CSS}\n${EDITORIAL_SOFT_CHROME_CSS}`;
  // Every accent fill that carried primary-on now carries accent-on first.
  const ON = "var(--token-color-accent-on,var(--token-color-primary-on,var(--token-color-background)))";
  assert.ok(css.includes(`background:var(--token-color-accent,var(--token-color-primary));color:${ON}`), "primary button fill");
  assert.doesNotMatch(css, /background:\$?\{?var\(--token-color-accent[^;}]*\);color:var\(--token-color-primary-on/);
  // Text in the accent is the derived, text-safe one.
  assert.doesNotMatch(css, /(?<![-\w])color:var\(--token-color-accent,var\(--token-color-primary\)\)/);
  assert.match(css, /#hero h1 em\{[^}]*color:var\(--token-color-accent-text,/);
});
