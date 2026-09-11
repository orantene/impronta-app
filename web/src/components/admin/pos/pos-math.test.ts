import assert from "node:assert/strict";
import { test } from "node:test";

import { basketTotals, changeDueCents, tenderIsShort } from "./pos-math";
import type { PosBasketLine } from "./pos-types";

function line(overrides: Partial<PosBasketLine> & { id: string; label: string }): PosBasketLine {
  return { units: 1, unitCents: 0, ...overrides };
}

test("basket totals: two lines, no discount, sums subtotal and total", () => {
  const lines: PosBasketLine[] = [
    line({ id: "a", label: "Coffee", units: 2, unitCents: 350 }),
    line({ id: "b", label: "Croissant", units: 1, unitCents: 425 }),
  ];
  const totals = basketTotals(lines);
  assert.equal(totals.subtotalCents, 2 * 350 + 425);
  assert.equal(totals.discountCents, 0);
  assert.equal(totals.totalCents, totals.subtotalCents);
});

test("basket totals: an add-on is charged once per line, not per unit", () => {
  const lines: PosBasketLine[] = [
    line({ id: "a", label: "Burger", units: 3, unitCents: 800, addonCents: 150 }),
  ];
  const totals = basketTotals(lines);
  assert.equal(totals.subtotalCents, 3 * 800 + 150);
});

test("basket totals: a discount reduces the total but never below zero", () => {
  const lines: PosBasketLine[] = [line({ id: "a", label: "Item", units: 1, unitCents: 500 })];
  const totals = basketTotals(lines, 10_000);
  assert.equal(totals.subtotalCents, 500);
  // The engine's own cartTotals clamps discount to the subtotal.
  assert.equal(totals.discountCents, 500);
  assert.equal(totals.totalCents, 0);
});

test("basket totals: an empty basket totals to zero everywhere", () => {
  const totals = basketTotals([]);
  assert.deepEqual(totals, { subtotalCents: 0, discountCents: 0, taxCents: 0, tipCents: 0, totalCents: 0 });
});

test("change due: exact tender gives zero change", () => {
  assert.equal(changeDueCents(1200, 1200), 0);
});

test("change due: overtender returns the difference", () => {
  assert.equal(changeDueCents(2000, 1235), 765);
});

test("change due: undertender never goes negative", () => {
  assert.equal(changeDueCents(500, 1200), 0);
});

test("tender is short: true when tendered is less than the amount due", () => {
  assert.equal(tenderIsShort(500, 1200), true);
  assert.equal(tenderIsShort(1200, 1200), false);
  assert.equal(tenderIsShort(1201, 1200), false);
});
