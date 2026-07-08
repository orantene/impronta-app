import { test } from "node:test";
import assert from "node:assert/strict";

import { backgroundModeToPolarity } from "./polarity";
import { TOKEN_REGISTRY } from "./registry";

test("every background.mode enum value classifies to a polarity (AIQ-12 drift guard)", () => {
  const validator = TOKEN_REGISTRY["background.mode"]!.validator as unknown as { options: readonly string[] };
  const values = validator.options;
  assert.ok(Array.isArray(values) && values.length > 0, "enum has values");
  for (const v of values) {
    const p = backgroundModeToPolarity(v);
    assert.ok(p === "light" || p === "dark", `background.mode "${v}" did not classify to a polarity`);
  }
});

test("known dark/light modes classify correctly, unknown → undefined (AIQ-12)", () => {
  assert.equal(backgroundModeToPolarity("editorial-noir"), "dark");
  assert.equal(backgroundModeToPolarity("espresso"), "dark");
  assert.equal(backgroundModeToPolarity("mesh-noir"), "dark");
  assert.equal(backgroundModeToPolarity("noir-or"), "dark");
  assert.equal(backgroundModeToPolarity("editorial-ivory"), "light");
  assert.equal(backgroundModeToPolarity("plain"), "light");
  assert.equal(backgroundModeToPolarity("mesh-blush"), "light");
  assert.equal(backgroundModeToPolarity(undefined), undefined);
  assert.equal(backgroundModeToPolarity(""), undefined);
  assert.equal(backgroundModeToPolarity(42), undefined);
});
