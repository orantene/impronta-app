import test from "node:test";
import assert from "node:assert/strict";

import { designTokensToCssVars, designTokensToDataAttrs } from "@/lib/site-admin/tokens/resolve";
import { TOKEN_REGISTRY } from "@/lib/site-admin/tokens/registry";
import {
  STYLE_TOKEN_DEFS,
  STYLE_TOKEN_PRESETS,
  applyStyleTokenPreset,
  resetStyleTokenGroup,
  styleTokenValidator,
} from "@/lib/site-admin/tokens/style-tokens";
import { resolveEffectiveSiteTokens } from "@/lib/talent-site/site-theme-tokens";
import { validateDesign } from "../validate";
import { designComponentStyleDefaults, designTokenDefaults } from "./design-token-defaults";
import { EDITORIAL_TYPE_SYSTEM_CSS, typeSystemComponentStyleDefaults } from "./design-type-system";
import { buildMaisonV2Payload, MAISON_V2_TOKEN_DEFAULTS } from "./maison-v2";
import { FOLIO_DESIGN_TOKEN_DEFAULTS } from "./folio-defaults";

const PLATFORM = { "color.primary": "#111111", "radius.base": "md" };

test("maison-v2 sets a valid default for every site style token, on its payload too", () => {
  for (const def of STYLE_TOKEN_DEFS) {
    const value = MAISON_V2_TOKEN_DEFAULTS[def.key];
    assert.ok(value, `missing default ${def.key}`);
    assert.ok(styleTokenValidator(def).safeParse(value).success, `invalid default ${def.key}=${value}`);
  }
  assert.deepEqual(designTokenDefaults("maison-v2"), MAISON_V2_TOKEN_DEFAULTS);
  assert.deepEqual(designTokenDefaults(" Maison-V2 "), MAISON_V2_TOKEN_DEFAULTS);
  // Folio's committed authored overlay (v18) patches two code defaults.
  assert.deepEqual(designTokenDefaults("folio"), {
    ...FOLIO_DESIGN_TOKEN_DEFAULTS,
    "button.padding-x": "20px",
    "type.hero-size-desktop": "clamp(72px,15cqi,240px)",
  });
  assert.deepEqual(designTokenDefaults(null), {});
  const payload = buildMaisonV2Payload();
  assert.deepEqual(payload.tokenDefaults, MAISON_V2_TOKEN_DEFAULTS);
  const check = validateDesign(payload);
  assert.ok(check.ok, check.errors.join("\n"));
});

test("validateDesign rejects non-style or invalid token defaults", () => {
  const payload = { ...buildMaisonV2Payload(), tokenDefaults: { "color.primary": "#000000", "button.radius": "1px;}" } };
  const check = validateDesign(payload);
  assert.equal(check.ok, false);
  assert.ok(check.errors.some((e) => e.includes("tokenDefaults.color.primary")));
  assert.ok(check.errors.some((e) => e.includes("tokenDefaults.button.radius")));
});

test("style tokens are registry tokens that default to empty (platform unchanged)", () => {
  for (const def of STYLE_TOKEN_DEFS) {
    const spec = TOKEN_REGISTRY[def.key];
    assert.ok(spec, def.key);
    assert.equal(spec.defaultValue, "");
    assert.equal(spec.agencyConfigurable, true);
  }
});

test("design defaults render as CSS vars and the type-system attribute", () => {
  const tokens = resolveEffectiveSiteTokens({}, {}, PLATFORM, MAISON_V2_TOKEN_DEFAULTS);
  const vars = designTokensToCssVars(tokens);
  assert.equal(vars["--token-button-radius"], "999px");
  assert.equal(vars["--token-type-hero-size-desktop"], "96px");
  // Release 2.5 (v19): 88px bands (was 84px).
  assert.equal(vars["--token-layout-section-pad-top"], "88px");
  const attrs = designTokensToDataAttrs(tokens);
  assert.equal(attrs["data-token-type-system"], "editorial");
  assert.equal(attrs["data-token-button-variant"], "fill");
  // Release 2.5: the soft chrome switch rides as a data attribute next to the type system.
  assert.equal(attrs["data-token-shape-chrome"], "soft");
});

test("overrides beat design defaults: site over design, page over site", () => {
  const site = { "button.radius": "12px", "type.hero-size": "60px" };
  const page = { "type.hero-size": "70px" };
  const tokens = resolveEffectiveSiteTokens(page, site, PLATFORM, MAISON_V2_TOKEN_DEFAULTS);
  assert.equal(tokens["button.radius"], "12px");
  assert.equal(tokens["type.hero-size"], "70px");
  assert.equal(tokens["shape.card-radius"], "22px");
  assert.equal(tokens["color.primary"], "#111111");
});

test("an empty style value falls through; reset returns the design default", () => {
  // The theme drawer saves its full map, so untouched style keys arrive as "".
  const edited = applyStyleTokenPreset({ "button.radius": "" }, STYLE_TOKEN_PRESETS.buttons.find((p) => p.id === "square")!);
  assert.equal(resolveEffectiveSiteTokens(edited, {}, PLATFORM, MAISON_V2_TOKEN_DEFAULTS)["button.radius"], "0px");
  const reset = resetStyleTokenGroup(edited, "buttons");
  for (const def of STYLE_TOKEN_DEFS.filter((d) => d.group === "buttons")) assert.equal(reset[def.key], "");
  const tokens = resolveEffectiveSiteTokens(reset, { "button.height": "" }, PLATFORM, MAISON_V2_TOKEN_DEFAULTS);
  assert.equal(tokens["button.radius"], "999px");
  assert.equal(tokens["button.height"], "48px");
  assert.equal(designTokensToCssVars(tokens)["--token-button-radius"], "999px");
});

test("without design defaults or site tokens the resolver is byte-identical to before", () => {
  const page = { "color.primary": "#222222" };
  assert.equal(resolveEffectiveSiteTokens(page, {}, PLATFORM), page);
  assert.equal(resolveEffectiveSiteTokens({}, {}, PLATFORM), PLATFORM);
});

test("the editorial stylesheet is token-driven: no hex, no design slug, no fixed px outside var fallbacks for key roles", () => {
  const css = EDITORIAL_TYPE_SYSTEM_CSS;
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(css, /maison/i);
  assert.doesNotMatch(css, /data-talent-design/);
  assert.match(css, /data-token-type-system="editorial"/);
  for (const key of ["button.radius", "button.height", "type.hero-size", "type.section-title-size", "shape.card-radius", "shape.rule-width"]) {
    assert.ok(css.includes(`var(--token-${key.replace(/\./g, "-")},`), key);
  }
  for (const hook of [".site-header", "#hero", ".site-builder-node--marquee", ".sb-portfolio", ".site-builder-node--services-catalog", ".sb-reviews", "#about", ".sb-visit", "#contact", "#site-footer", ".cb-bar"]) {
    assert.ok(css.includes(hook), hook);
  }
});

test("editorial component defaults: pill radius bound to the token, pinned text colours dropped", () => {
  const base = {
    heading: { textColor: "token:color.ink" },
    paragraph: { textColor: "token:color.muted" },
    button: { backgroundColor: "token:color.accent", textColor: "#ffffff", borderRadius: "10px" },
    card: { borderColor: "token:color.line" },
  };
  const out = designComponentStyleDefaults("maison-v2", base);
  assert.deepEqual(out.button, { borderRadius: "token:button.radius" });
  assert.equal(out.heading, undefined);
  assert.equal(out.paragraph, undefined);
  assert.deepEqual(out.card, base.card);
  // Folio is magazine type.system — same drop of pinned text colours + token radius.
  const folioOut = designComponentStyleDefaults("folio", base);
  assert.deepEqual(folioOut.button, { borderRadius: "token:button.radius" });
  assert.equal(folioOut.heading, undefined);
  assert.equal(folioOut.paragraph, undefined);
  assert.deepEqual(folioOut.card, base.card);
  assert.equal(typeSystemComponentStyleDefaults({ "type.system": "off" }, base), base);
});
