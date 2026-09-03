/**
 * menu-board-stock.test.ts — the menu board's stock and payment rules.
 *
 * Three regressions live here:
 *
 * 1. `unitsLeft: null` means UNLIMITED, not zero. Collapsing them either caps an
 *    unlimited item at nothing or hides a sold-out badge.
 * 2. Pay-in-person is ALL lines, not ANY. Until guest checkout exists a card
 *    request on a menu order is uncompletable (the pay sheet is account-only and
 *    guest threads render payment cards read-only), so an order that says "pay in
 *    person" and cannot be settled that way is the same broken promise inverted.
 * 3. Stock is keyed on PRESENCE, never on `kind`. instant-book reserves only for
 *    `kind === "product"`, and the live seat-limited class is `kind='package'`.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_QTY,
  fill,
  isSoldOut,
  maxAddableQty,
  shouldPayInPerson,
} from "./menu-board-stock";

test("null stock is unlimited, not zero", () => {
  assert.equal(maxAddableQty({ unitsLeft: null }), MAX_QTY);
  assert.equal(isSoldOut({ unitsLeft: null }), false);
});

test("zero stock is sold out and adds nothing", () => {
  assert.equal(maxAddableQty({ unitsLeft: 0 }), 0);
  assert.equal(isSoldOut({ unitsLeft: 0 }), true);
});

test("a stock-limited item caps at its remaining units", () => {
  assert.equal(maxAddableQty({ unitsLeft: 12 }), 12);
  assert.equal(isSoldOut({ unitsLeft: 12 }), false);
});

test("stock never exceeds the stepper ceiling, and negatives floor at zero", () => {
  assert.equal(maxAddableQty({ unitsLeft: 5000 }), MAX_QTY);
  assert.equal(maxAddableQty({ unitsLeft: -3 }), 0);
  assert.equal(isSoldOut({ unitsLeft: -3 }), true);
});

test("pay in person requires EVERY line to allow it", () => {
  assert.equal(shouldPayInPerson([{ allowPayInPerson: true }]), true);
  assert.equal(
    shouldPayInPerson([{ allowPayInPerson: true }, { allowPayInPerson: true }]),
    true,
  );
  assert.equal(
    shouldPayInPerson([{ allowPayInPerson: true }, { allowPayInPerson: false }]),
    false,
    "one card-only line makes the whole order card-only",
  );
});

test("an empty order is not pay-in-person", () => {
  assert.equal(
    shouldPayInPerson([]),
    false,
    "an empty selection must not render the pay-in-person promise",
  );
});

test("fill interpolates every occurrence of a token", () => {
  assert.equal(fill("Only {count} left", { count: 3 }), "Only 3 left");
  assert.equal(fill("{item} and {item}", { item: "pizza" }), "pizza and pizza");
  assert.equal(fill("no tokens", { count: 1 }), "no tokens");
});
