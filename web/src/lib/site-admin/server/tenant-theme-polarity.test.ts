/**
 * Server-side theme polarity for AI generation (AIQ-12).
 *
 * The DB read is a thin wrapper; the precedence + classification logic is pure,
 * and that is what is locked here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { themeGenerationContextFromBrandingRow } from "./tenant-theme-polarity";

test("a dark published theme resolves to dark polarity with its own swatches", () => {
  const ctx = themeGenerationContextFromBrandingRow({
    theme_json: {
      "background.mode": "editorial-noir",
      "color.background": "#0a0a0a",
      "color.ink": "#f4f4f5",
      "color.primary": "#c8a45c",
    },
  });
  assert.equal(ctx.polarity, "dark");
  assert.deepEqual(ctx.palette, { background: "#0a0a0a", ink: "#f4f4f5", primary: "#c8a45c" });
});

test("a light mode resolves to light", () => {
  assert.equal(
    themeGenerationContextFromBrandingRow({ theme_json: { "background.mode": "atelier-blanc" } })
      .polarity,
    "light",
  );
});

test("the DRAFT theme wins key by key, without blanking the published palette", () => {
  const ctx = themeGenerationContextFromBrandingRow({
    theme_json: {
      "background.mode": "atelier-blanc",
      "color.background": "#ffffff",
      "color.primary": "#c8a45c",
    },
    // The operator switched the canvas to a dark mode but has not republished.
    theme_json_draft: { "background.mode": "espresso" },
  });
  assert.equal(ctx.polarity, "dark", "the draft the operator is looking at wins");
  assert.equal(ctx.palette?.primary, "#c8a45c", "published palette keys survive");
});

test("no row, no tokens, or a non-string mode → no polarity (prompt keeps its neutral wording)", () => {
  assert.deepEqual(themeGenerationContextFromBrandingRow(null), {});
  assert.deepEqual(themeGenerationContextFromBrandingRow({}), {});
  assert.deepEqual(themeGenerationContextFromBrandingRow({ theme_json: "not-an-object" }), {});
  assert.deepEqual(
    themeGenerationContextFromBrandingRow({ theme_json: { "background.mode": 7 } }),
    {},
  );
  assert.deepEqual(
    themeGenerationContextFromBrandingRow({ theme_json: { "background.mode": "   " } }),
    {},
  );
});

test("a palette with no polarity still resolves (partial themes are common)", () => {
  const ctx = themeGenerationContextFromBrandingRow({
    theme_json: { "color.primary": "#123456" },
  });
  assert.equal(ctx.polarity, undefined);
  assert.deepEqual(ctx.palette, { primary: "#123456" });
});
