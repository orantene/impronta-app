/**
 * menu-order-stock.static.test.ts — the two properties of menu inventory that
 * silently regress.
 *
 * 1. THE GATE IS `inventoryQty`, NOT `kind === "product"`.
 *    instant-book reserves stock only for `kind === "product"`. Copying that gate
 *    into the menu engine looks right and is wrong: a seat-limited class ships as
 *    kind 'package' (the live "Posing course - 12 spots" is one), so a kind gate
 *    leaves exactly the offering that needs enforcement unenforced. The page keeps
 *    advertising 12 seats while a hundred people order it, with no error anywhere.
 *
 * 2. EVERY FAILURE PATH AFTER THE RESERVATION RELEASES IT.
 *    Reserved-but-not-released stock is invisible: the seat count silently drifts
 *    down until the item reads sold out while nobody holds a booking. There are
 *    eight failure returns plus a catch, and the next person to add a ninth is who
 *    this test is for.
 *
 * Shape-based on purpose — it looks for the presence of a release call before each
 * failure return rather than pinning exact source text, so reformatting and renamed
 * error strings do not redden main.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ENGINE = path.join(process.cwd(), "src/lib/inquiry/menu-order-engine.ts");
const raw = readFileSync(ENGINE, "utf8");

/**
 * Comments are stripped before any assertion. The first version of this test
 * failed on the engine's own explanatory comment, which names the very pattern it
 * warns against — a guard that pins prose rather than code is a guard that reddens
 * main on a clean edit.
 */
const source = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("stock is gated on inventoryQty, never on kind === product", () => {
  const gate = /if\s*\(\s*offering\.inventoryQty\s*!=\s*null\s*\)/.test(source);
  assert.equal(gate, true, "expected an `offering.inventoryQty != null` stock gate");

  // A kind gate here would re-open the bug for seat-limited packages.
  assert.equal(
    /kind\s*===\s*"product"/.test(source),
    false,
    'menu stock must not be gated on kind === "product" — a seat-limited class is kind "package"',
  );
});

test("the reservation happens before any inquiry, offer or charge exists", () => {
  const reserveAt = source.indexOf("reserve_offering_stock");
  const submitAt = source.indexOf("submitInquiry(");
  assert.ok(reserveAt > 0, "expected a reserve_offering_stock call");
  assert.ok(submitAt > 0, "expected a submitInquiry call");
  assert.ok(
    reserveAt < submitAt,
    "stock must be reserved before the inquiry is created, so a sold-out order leaves no orphan thread",
  );
});

test("every failure return after the reservation releases the stock", () => {
  const reserveAt = source.indexOf("reserve_offering_stock");
  assert.ok(reserveAt > 0);

  const offenders: string[] = [];
  const failure = /return\s*\{\s*\n?\s*ok:\s*false/g;
  let m: RegExpExecArray | null;
  while ((m = failure.exec(source)) !== null) {
    if (m.index <= reserveAt) continue; // pre-reservation returns hold nothing
    const window = source.slice(Math.max(0, m.index - 400), m.index);
    if (!window.includes("releaseReserved()")) {
      const line = source.slice(0, m.index).split("\n").length;
      offenders.push(`line ${line}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `these failure returns leak reserved stock: ${offenders.join(", ")}. ` +
      "Add `await releaseReserved();` before the return.",
  );
});

test("the catch block compensates too, and the helper is hoisted so it can", () => {
  const catchAt = source.indexOf("} catch (err)");
  assert.ok(catchAt > 0, "expected a catch block");
  assert.ok(
    source.slice(catchAt).includes("releaseReserved()"),
    "a throw after reservation must release the stock",
  );

  // The helper must be declared OUTSIDE the try, or it is not in scope in the catch.
  const helperAt = source.indexOf("const releaseReserved");
  const tryAt = source.indexOf("  try {");
  assert.ok(helperAt > 0 && tryAt > 0);
  assert.ok(
    helperAt < tryAt,
    "releaseReserved must be hoisted above the try, or the catch cannot call it",
  );
});
