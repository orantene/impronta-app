/**
 * Guards on the stock-write path.
 *
 * The property that matters is negative: NOTHING may write
 * talent_offerings.inventory_qty directly. It is the mirror of a capacity pool,
 * and a direct write either shrinks the pool ceiling below what is outstanding
 * or desyncs the number the storefront renders. Every edit goes through
 * set_offering_stock, which does `units_total = available + held` under the
 * pool's row lock.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { stockChanged } from "./offering-stock-admin";

const SRC = join(process.cwd(), "src");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

test("stockChanged detects every transition the editor can make", () => {
  assert.equal(stockChanged(12, 12), false);
  assert.equal(stockChanged(null, null), false);
  assert.equal(stockChanged(12, 11), true);
  assert.equal(stockChanged(12, null), true, "limited to unlimited is a change");
  assert.equal(stockChanged(null, 12), true, "unlimited to limited is a change");
  assert.equal(stockChanged(12, 0), true, "closing the shop is a change");
  assert.equal(stockChanged(undefined, null), false, "an absent mirror is unlimited");
});

test("stockChanged rounds rather than treating 12.0 as a change", () => {
  assert.equal(stockChanged(12, 12.4), false);
  assert.equal(stockChanged(12, 12.6), true);
});

test("the editor write shape cannot carry inventory_qty", () => {
  const src = read("lib/talent/offerings-types.ts");
  assert.ok(
    !/^\s*inventory_qty: o\./m.test(src),
    "offeringToRowPatch must not write inventory_qty — stock goes through set_offering_stock",
  );
  assert.ok(
    src.includes('"id" | "talent_profile_id" | "inventory_qty"'),
    "the patch return type must exclude inventory_qty so a direct write cannot typecheck",
  );
});

test("the talent save path routes stock through the RPC", () => {
  const src = read("lib/talent/offerings-actions.ts");
  assert.ok(src.includes("setOfferingStock("), "stock must be applied via setOfferingStock");
  assert.ok(
    src.includes("stockChanged(saved.inventory_qty, offering.inventoryQty)"),
    "an unrelated save must not disturb a live pool",
  );
});

test("no code outside the capacity engine updates inventory_qty", () => {
  // The engine's own SQL wrappers maintain the mirror; nothing else may.
  for (const rel of [
    "lib/talent/offerings-actions.ts",
    "lib/talent/menu-offerings-actions.ts",
    "lib/talent/offerings-types.ts",
  ]) {
    const src = read(rel);
    assert.ok(
      !/\.update\(\s*\{[\s\S]*?inventory_qty/.test(src),
      `${rel} must not UPDATE inventory_qty directly`,
    );
  }
});
