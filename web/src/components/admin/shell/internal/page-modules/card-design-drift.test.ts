import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeDesignDirty,
  computeDriftCount,
  STANDING_DEFAULTS,
} from "./card-design-drift";

test("computeDesignDirty: identical maps are clean", () => {
  assert.equal(computeDesignDirty({ a: "1" }, { a: "1" }), false);
});

test("computeDesignDirty: empty string and absent key are equal", () => {
  assert.equal(computeDesignDirty({ a: "" }, {}), false);
});

test("computeDesignDirty: union of keys — a draft-only key counts", () => {
  assert.equal(computeDesignDirty({ a: "1", b: "x" }, { a: "1" }), true);
});

test("computeDriftCount: page-owned keys are excluded", () => {
  const owned = new Set(["card.surface", ...Object.keys(STANDING_DEFAULTS)]);
  const draft = {
    "card.surface": "#000", // owned — excluded even though it differs
    "typography.heading-preset": "sans", // drift 1
    "background.mode": "plain", // drift 2
  };
  const live = {
    "card.surface": "#fff",
    "typography.heading-preset": "cinzel-editorial",
    "background.mode": "editorial-noir",
  };
  assert.equal(computeDriftCount(draft, live, owned), 2);
});

test("computeDriftCount: zero when only page-owned tokens differ", () => {
  const owned = new Set(["card.surface"]);
  assert.equal(
    computeDriftCount({ "card.surface": "#000" }, { "card.surface": "#fff" }, owned),
    0,
  );
});

test("computeDriftCount: live-only key (draft dropped it) counts as drift", () => {
  const owned = new Set<string>();
  assert.equal(computeDriftCount({}, { logo_url: "https://x/logo.png" }, owned), 1);
});
