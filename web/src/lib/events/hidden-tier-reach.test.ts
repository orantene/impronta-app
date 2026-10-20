import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { tierRefUnlocks } from "@/lib/offerings/sellable";

const src = readFileSync(join(process.cwd(), "src/app/(public)/_events/ticket-picker-actions.ts"), "utf8");

test("hidden tier: a guessable pool_key never unlocks it, only the variant id does", () => {
  const comp = { variantId: "3f1c0a52-9b7e-4d1a-8c55-0a1b2c3d4e5f", tierKey: "comp" };
  assert.equal(tierRefUnlocks("comp", comp), false);
  assert.equal(tierRefUnlocks(comp.variantId, comp), true);
});

test("hidden tier: the anon picker payload builds nights and availability from the listed tiers only", () => {
  assert.match(src, /listedIds\.has\(v\.id as string\) && keys\.has\(v\.pool_key as string\)/);
  assert.doesNotMatch(src, /sellableVariantIds: tierRows\.filter\(\(v\) => keys\.has/);
  assert.match(src, /filter\(\(\[id\]\) => listedIds\.has\(id\)\)/);
});

test("hidden tier: the loader never lists a hidden tier by its pool key, and the purchase unlock ignores the key", () => {
  assert.doesNotMatch(src, /t\.tierKey === includeTierKey/);
  assert.doesNotMatch(src, /tierRefUnlocks\(d\.unlockTier, \{ variantId: tier\.id, tierKey/);
});
