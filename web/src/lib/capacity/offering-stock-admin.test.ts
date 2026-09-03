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
  //
  // Two bugs fixed here after this guard failed a PR that does exactly what it
  // asks for (menu-offerings-actions.ts, which calls setOfferingStock and
  // touches the column nowhere):
  //
  // 1. `[\s\S]*?` is lazy but UNBOUNDED, so it matched an unrelated
  //    `.update({ sort_order })` and then walked 31 lines forward to find
  //    `inventory_qty` somewhere else entirely. The match must not cross out of
  //    the object literal it starts in, so the body is now "not a closing
  //    brace".
  // 2. It scanned COMMENTS. The prose explaining WHY a file must not write the
  //    column tripped the guard against writing it. Comments are stripped first
  //    — a guard that pins prose fails on the sentence that documents it.
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  for (const rel of [
    "lib/talent/offerings-actions.ts",
    "lib/talent/menu-offerings-actions.ts",
    "lib/talent/offerings-types.ts",
  ]) {
    const src = stripComments(read(rel));
    assert.ok(
      !/\.update\(\s*\{[^}]*?inventory_qty/.test(src),
      `${rel} must not UPDATE inventory_qty directly`,
    );
  }
});

test("the inventory_qty guard still catches a real direct write", () => {
  // Self-check: the fix above narrows the pattern, so prove it did not narrow it
  // into uselessness. A guard that cannot fail is worse than no guard.
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const offender = stripComments(`
    // a comment mentioning inventory_qty must NOT trip this
    await admin.from("talent_offerings").update({ inventory_qty: 5 }).eq("id", id);
  `);
  assert.ok(/\.update\(\s*\{[^}]*?inventory_qty/.test(offender), "a real write must still fail");

  const innocent = stripComments(`
    await admin.from("talent_offerings").update({ sort_order: 1 }).eq("id", id);
    /** Stock goes through set_offering_stock, never inventory_qty. */
  `);
  assert.ok(
    !/\.update\(\s*\{[^}]*?inventory_qty/.test(innocent),
    "an unrelated update plus prose must NOT fail",
  );
});
