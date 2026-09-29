import test from "node:test";
import assert from "node:assert/strict";

import {
  designComponentStyleDefaults,
  designSkinCss,
  designTokenDefaults,
  mergeDesignTokenDefaults,
} from "./design-skins";
import { FOLIO_DESIGN_TOKEN_DEFAULTS, FOLIO_LABEL_FONT } from "./folio-defaults";

test("maison-v2 swaps the platform button block for a pill and drops pinned text colours", () => {
  const base = {
    heading: { textColor: "token:color.ink" },
    paragraph: { textColor: "token:color.muted" },
    button: { backgroundColor: "token:color.accent", textColor: "#ffffff", borderRadius: "10px" },
    card: { borderColor: "token:color.line" },
  };
  const out = designComponentStyleDefaults("maison-v2", base);
  assert.deepEqual(out.button, { borderRadius: "999px" });
  assert.equal(out.heading, undefined);
  assert.equal(out.paragraph, undefined);
  assert.deepEqual(out.card, base.card);
  assert.equal(designComponentStyleDefaults(null, base), base);
});

test("folio swaps the platform button for a square and drops pinned text colours", () => {
  const base = {
    heading: { textColor: "token:color.ink" },
    paragraph: { textColor: "token:color.muted" },
    button: { backgroundColor: "token:color.accent", textColor: "#ffffff", borderRadius: "10px" },
    card: { borderColor: "token:color.line" },
  };
  const out = designComponentStyleDefaults("folio", base);
  assert.deepEqual(out.button, { borderRadius: "0" });
  assert.equal(out.heading, undefined);
  assert.equal(out.paragraph, undefined);
  assert.deepEqual(out.card, base.card);
});

test("folio design token defaults use existing registry keys only (sharp / editorial / nav font)", () => {
  const defaults = designTokenDefaults("folio");
  assert.deepEqual(defaults, FOLIO_DESIGN_TOKEN_DEFAULTS);
  assert.equal(defaults["radius.scale-preset"], "sharp");
  assert.equal(defaults["radius.base"], "none");
  assert.equal(defaults["spacing.scale"], "editorial");
  assert.equal(defaults["shadow.preset"], "none");
  assert.equal(defaults["shell.header-nav-font"], FOLIO_LABEL_FONT);
  // No invented keys — Claude's design-defaults-editable owns new roles.
  assert.equal(defaults["typography.label-font-family"], undefined);
  assert.equal(defaults["border.rule-width"], undefined);
  assert.equal(Object.keys(designTokenDefaults("maison-v2")).length, 0);
});

test("mergeDesignTokenDefaults fills empty keys and force overwrites for reset", () => {
  const draft = { "radius.scale-preset": "pill", "color.ink": "#111" };
  const soft = mergeDesignTokenDefaults(draft, "folio");
  assert.equal(soft["radius.scale-preset"], "pill", "talent edit wins");
  assert.equal(soft["spacing.scale"], "editorial", "empty key filled");
  assert.equal(soft["color.ink"], "#111");
  const hard = mergeDesignTokenDefaults(draft, "folio", { force: true });
  assert.equal(hard["radius.scale-preset"], "sharp", "force restores design default");
});

test("the maison-v2 skin uses token vars only (no hex) and covers every Builder map row", () => {
  const css = designSkinCss("maison-v2")!;
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
  for (const hook of [".site-header", "#hero", ".site-builder-node--marquee", ".sb-portfolio", ".site-builder-node--services-catalog", ".sb-reviews", "#about", ".sb-visit", "#contact", "#site-footer", ".cb-bar"]) {
    assert.ok(css.includes(hook), hook);
  }
});

test("folio skin values are token vars (no hardcoded Archivo Narrow / radius 0 / 1px)", () => {
  const css = designSkinCss("folio")!;
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(css, /"Archivo Narrow"/);
  assert.doesNotMatch(css, /border-radius:\s*0(?![.\d])/);
  assert.ok(css.includes("var(--token-shell-header-nav-font"));
  assert.ok(css.includes("var(--site-radius"));
  assert.ok(css.includes("var(--token-border-rule-width"));
  assert.ok(css.includes(".site-header"));
  assert.ok(css.includes('data-layout="rate_card"'));
});
