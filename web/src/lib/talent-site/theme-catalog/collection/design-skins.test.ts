import test from "node:test";
import assert from "node:assert/strict";

import { designComponentStyleDefaults, designSkinCss } from "./design-skins";

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
  assert.equal(designComponentStyleDefaults("folio", base), base);
  assert.equal(designComponentStyleDefaults(null, base), base);
});

test("the maison-v2 skin uses token vars only (no hex) and covers every Builder map row", () => {
  const css = designSkinCss("maison-v2")!;
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
  for (const hook of [".site-header", "#hero", ".site-builder-node--marquee", ".sb-portfolio", ".site-builder-node--services-catalog", ".sb-reviews", "#about", ".sb-visit", "#contact", "#site-footer", ".cb-bar"]) {
    assert.ok(css.includes(hook), hook);
  }
});
