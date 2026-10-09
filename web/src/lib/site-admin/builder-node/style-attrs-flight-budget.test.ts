/**
 * TUL-446 — `builderNodeStyleAttrs` must omit undefined values.
 *
 * RSC serializes explicit `undefined` prop values as `"$undefined"`. Emitting
 * ~250 unused style presence keys per node blew book-jorgelina past 1.7 MB.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { builderNodeStyleAttrs } from "./render";

test("empty style → no attrs (no $undefined keys in the object)", () => {
  const attrs = builderNodeStyleAttrs(undefined);
  assert.deepEqual(attrs, {});
  assert.equal(Object.values(attrs).includes(undefined as never), false);
});

test("partial style → only defined presence / value attrs", () => {
  const attrs = builderNodeStyleAttrs({
    align: "center",
    objectFit: "cover",
    fullBleed: true,
    responsive: {
      tablet: { maxWidth: "wide" },
      mobile: { objectFit: "contain" },
    },
  });
  assert.equal(attrs["data-builder-style-align"], "center");
  assert.equal(attrs["data-builder-style-fit"], "cover");
  assert.equal(attrs["data-builder-full-bleed"], "");
  assert.equal(attrs["data-builder-style-tablet-width"], "wide");
  assert.equal(attrs["data-builder-style-mobile-fit"], "contain");
  // Unset lanes must be absent — not present as undefined.
  assert.equal("data-builder-style-size" in attrs, false);
  assert.equal("data-builder-style-tablet-align" in attrs, false);
  assert.equal("data-builder-style-mobile-align" in attrs, false);
  assert.equal("data-builder-style-hover-bg" in attrs, false);
  for (const value of Object.values(attrs)) {
    assert.notEqual(value, undefined);
  }
});

test("Maison-scale empty nodes stay tiny when serialized", () => {
  // 58 nodes × ~250 undefined keys was ~800 KB of flight waste. An empty
  // style object must serialize to "{}" (or near-empty), not a wall of
  // "$undefined".
  const attrs = builderNodeStyleAttrs({});
  const json = JSON.stringify(attrs);
  assert.ok(json.length < 8, `expected tiny JSON, got ${json.length}: ${json}`);
});
