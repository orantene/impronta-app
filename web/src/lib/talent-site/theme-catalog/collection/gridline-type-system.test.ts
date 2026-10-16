/**
 * Gridline type system (G1): utility type system, stretch token, mono label
 * role, highlighter accent, Archivo `wdth` axis in the font URL.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { buildGoogleFontsHrefFromUsage, widthAxisForFamily } from "@/lib/site-admin/builder-node/fonts-catalog";
import { designTokensToCssVars, designTokensToDataAttrs } from "@/lib/site-admin/tokens/resolve";
import { STYLE_TOKEN_BY_KEY, STYLE_TOKEN_DEFS, styleTokenValidator } from "@/lib/site-admin/tokens/style-tokens";
import { resolveEffectiveSiteTokens } from "@/lib/talent-site/site-theme-tokens";

import { designTokenDefaults } from "./design-token-defaults";
import { EDITORIAL_TYPE_SYSTEM_CSS } from "./design-type-system";
import { HIGHLIGHT_ACCENT_CSS, UTILITY_TYPE_SYSTEM_CSS } from "./design-type-system-utility";
import { GRIDLINE_DESIGN_TOKEN_DEFAULTS, GRIDLINE_STYLE_TOKEN_DEFAULTS } from "./gridline-defaults";
import { MAISON_V2_TOKEN_DEFAULTS } from "./maison-v2-tokens";

test("every Gridline style default is a real style token with a valid value", () => {
  for (const [key, value] of Object.entries(GRIDLINE_STYLE_TOKEN_DEFAULTS)) {
    const def = STYLE_TOKEN_BY_KEY.get(key);
    assert.ok(def, `unknown style token ${key}`);
    assert.ok(styleTokenValidator(def).safeParse(value).success, `${key}=${value}`);
  }
  assert.deepEqual(designTokenDefaults("gridline"), GRIDLINE_DESIGN_TOKEN_DEFAULTS);
});

test("the new options are editable: utility system, highlighter, stretch have EN and ES labels", () => {
  const system = STYLE_TOKEN_BY_KEY.get("type.system")!;
  assert.ok(system.options!.some((o) => o.value === "utility" && o.en && o.es));
  const accent = STYLE_TOKEN_BY_KEY.get("type.accent-style")!;
  assert.ok(accent.options!.some((o) => o.value === "highlight" && o.en && o.es));
  const stretch = STYLE_TOKEN_BY_KEY.get("type.stretch")!;
  assert.ok(stretch.label.en && stretch.label.es);
  assert.equal(stretch.fallback, "100%");
  // Every other design still sets every style token (maison-v2 test contract).
  for (const def of STYLE_TOKEN_DEFS) assert.ok(MAISON_V2_TOKEN_DEFAULTS[def.key], def.key);
});

test("Gridline defaults project the utility system, the highlighter attribute and the width var", () => {
  const tokens = resolveEffectiveSiteTokens({}, {}, {}, GRIDLINE_DESIGN_TOKEN_DEFAULTS);
  const attrs = designTokensToDataAttrs(tokens);
  assert.equal(attrs["data-token-type-system"], "utility");
  assert.equal(attrs["data-token-type-accent-style"], "highlight");
  const vars = designTokensToCssVars(tokens);
  assert.equal(vars["--token-type-stretch"], "118%");
  assert.equal(vars["--token-type-accent-style"], "highlight", "the var is still emitted");
  // The editorial default is unchanged: italic stays a var-only value for older designs.
  const old = designTokensToDataAttrs(resolveEffectiveSiteTokens({}, {}, {}, MAISON_V2_TOKEN_DEFAULTS));
  assert.equal(old["data-token-type-accent-style"], "italic");
});

test("the utility stylesheet is token-driven: no hex, no slug, stretch and mono label wired, accent-on on fills", () => {
  const css = `${UTILITY_TYPE_SYSTEM_CSS}\n${HIGHLIGHT_ACCENT_CSS}`;
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(css, /gridline|maison|\bfolio\b/i);
  assert.match(css, /data-token-type-system="utility"/);
  assert.match(css, /font-stretch:var\(--token-type-stretch,100%\)/);
  assert.match(css, /--token-shell-header-nav-font/, "label role reads the mono face token");
  assert.match(css, /background:var\(--token-color-accent,var\(--token-color-primary\)\);color:var\(--token-color-accent-on,/);
  assert.match(css, /color:var\(--token-color-accent-text,/);
  assert.match(css, /data-token-type-accent-style="highlight"\] :is\(h1,h2,h3,[^)]*\) em\{[^}]*color:var\(--token-color-accent-on,/);
  // The editorial sheet is untouched by the new system.
  assert.doesNotMatch(EDITORIAL_TYPE_SYSTEM_CSS, /utility/);
});

test("Archivo requests the wdth axis only when a usage asks for stretch", () => {
  assert.deepEqual(widthAxisForFamily("Archivo"), { min: 100, max: 125 });
  assert.equal(widthAxisForFamily("Inter"), null);
  const weights = [400, 500, 600, 700, 800, 900];
  const wide = buildGoogleFontsHrefFromUsage([{ value: "Archivo, sans-serif", weights, stretch: true }])!;
  assert.match(wide, /family=Archivo:wdth,wght@100\.\.125,400\.\.900/);
  const wideItalic = buildGoogleFontsHrefFromUsage([{ value: "Archivo", weights, italic: true, stretch: true }])!;
  assert.match(wideItalic, /ital,wdth,wght@0,100\.\.125,400\.\.900;1,100\.\.125,400\.\.900/);
  // Without stretch the URL is byte-identical to before.
  assert.equal(
    buildGoogleFontsHrefFromUsage([{ value: "Archivo", weights }]),
    "https://fonts.googleapis.com/css2?family=Archivo:wght@400..900&display=swap",
  );
  // A family without the axis ignores the request; mono loads as before.
  assert.equal(
    buildGoogleFontsHrefFromUsage([{ value: "Inter", weights: [400, 700], stretch: true }]),
    buildGoogleFontsHrefFromUsage([{ value: "Inter", weights: [400, 700] }]),
  );
  const both = buildGoogleFontsHrefFromUsage([
    { value: "Archivo", weights, stretch: true },
    { value: '"JetBrains Mono", ui-monospace', weights: [400, 500, 700] },
  ])!;
  assert.match(both, /family=JetBrains\+Mono:wght@400\.\.700/);
});

test("Gridline FAQ heading follows the section-title tokens (25px phone, 40px desktop) and only the utility system", () => {
  assert.match(UTILITY_TYPE_SYSTEM_CSS, /#faq \.site-builder-node--heading\{font-size:var\(--token-type-section-title-size[^)]*\)\}/);
  assert.match(UTILITY_TYPE_SYSTEM_CSS, /#faq \.site-builder-node--heading\{font-size:var\(--token-type-section-title-size-desktop/);
  assert.equal(GRIDLINE_STYLE_TOKEN_DEFAULTS["type.section-title-size"], "25px");
  assert.equal(GRIDLINE_STYLE_TOKEN_DEFAULTS["type.section-title-size-desktop"], "40px");
  assert.ok(!EDITORIAL_TYPE_SYSTEM_CSS.includes("#faq"), "other type systems are untouched");
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(UTILITY_TYPE_SYSTEM_CSS.replace(/#(hero|faq)\b/g, "")), "no hex");
});

test("Gridline utility bar keeps its subtitle and status pill down to a 330px bar", async () => {
  const { UTILITY_BAR_CSS } = await import("@/lib/site-admin/builder-node/utility-bar-block");
  // TUL-474/496 (#3117): below 330px the whole status pill drops (no stray dot); the subtitle stays.
  assert.match(UTILITY_BAR_CSS, /@container sbub \(max-width:330px\)\{\.sb-ub-pill\{display:none\}/);
  assert.doesNotMatch(UTILITY_BAR_CSS, /\(max-width:330px\)\{[^}]*\.sb-ub-nm small\{display:none/);
  assert.ok(!UTILITY_BAR_CSS.includes("max-width:370px"));
  // TUL-474: subtitle wraps instead of truncating "Electricista · Monterrey".
  assert.match(UTILITY_BAR_CSS, /\.sb-ub-nm small\{[^}]*white-space:normal/);
});

test("TUL-474: utility chrome clears work_order captions under sticky dock/bar", () => {
  assert.match(
    UTILITY_TYPE_SYSTEM_CSS,
    /scroll-padding-bottom:calc\(92px \+ env\(safe-area-inset-bottom,0px\)\)/,
  );
  assert.match(
    UTILITY_TYPE_SYSTEM_CSS,
    /\.sb-portfolio\[data-portfolio-layout="work_order"\]\{padding-bottom:var\(--cb-bar-h,calc\(86px \+ env\(safe-area-inset-bottom,0px\)\)\)\}/,
  );
  assert.match(UTILITY_TYPE_SYSTEM_CSS, /\.sb-area-title/);
  assert.match(UTILITY_TYPE_SYSTEM_CSS, /#hero \.site-builder-node--container\[data-builder-layout="row"\]\{flex-wrap:nowrap\}/);
});
