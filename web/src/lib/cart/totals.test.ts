import test from "node:test";
import assert from "node:assert/strict";

import {
  EMPTY_TOTALS,
  cartTotals,
  lineTotalCents,
  totalsAreWritable,
} from "./totals";

/**
 * These assert the arithmetic AND that its output satisfies the database's own
 * constraints, because `orders_total_is_derived` and `orders_amounts_nonneg`
 * will reject a bad row rather than store it. A test that only checked the
 * numbers would let a rejected write reach production as a runtime failure.
 */

test("an empty cart totals zero and is writable", () => {
  const totals = cartTotals([]);
  assert.deepEqual(totals, EMPTY_TOTALS);
  assert.equal(totalsAreWritable(totals), true);
});

test("lines roll up in integer cents", () => {
  const totals = cartTotals([
    { unitCents: 1200, units: 1 },
    { unitCents: 2400, units: 2 },
  ]);
  assert.equal(totals.subtotalCents, 6000);
  assert.equal(totals.totalCents, 6000);
  assert.equal(totalsAreWritable(totals), true);
});

test("a discount is subtracted and never exceeds the subtotal", () => {
  // An over-large promo must produce a free order, not a negative total, which
  // `orders_amounts_nonneg` would reject outright.
  const totals = cartTotals([{ unitCents: 1000, units: 1 }], 5000);
  assert.equal(totals.discountCents, 1000);
  assert.equal(totals.totalCents, 0);
  assert.equal(totalsAreWritable(totals), true);
});

test("a negative discount is treated as none", () => {
  const totals = cartTotals([{ unitCents: 1000, units: 1 }], -500);
  assert.equal(totals.discountCents, 0);
  assert.equal(totals.totalCents, 1000);
});

test("tax is threaded through and lands in the derived total", () => {
  // Zero until D5, but wired now so the day it is non-zero is a value change
  // rather than a schema change.
  const totals = cartTotals([{ unitCents: 1000, units: 2, taxCents: 320 }]);
  assert.equal(totals.taxCents, 320);
  assert.equal(totals.totalCents, 2320);
  assert.equal(totalsAreWritable(totals), true);
});

test("fractional and junk inputs cannot produce a fractional total", () => {
  // The column is bigint. A float in would be a rejected write, so it is
  // truncated at the door instead.
  for (const line of [
    { unitCents: 10.7, units: 3 },
    { unitCents: 1000, units: 2.6 },
    { unitCents: Number.NaN, units: 2 },
    { unitCents: 1000, units: Number.POSITIVE_INFINITY },
  ]) {
    const totals = cartTotals([line]);
    assert.ok(Number.isInteger(totals.totalCents), `${JSON.stringify(line)} produced a non-integer`);
    assert.ok(totals.totalCents >= 0);
    assert.equal(totalsAreWritable(totals), true);
  }
});

test("zero units or a free line contribute nothing", () => {
  assert.equal(lineTotalCents({ unitCents: 5000, units: 0 }), 0);
  assert.equal(lineTotalCents({ unitCents: 0, units: 4 }), 0);
});

test("a negative price is clamped to zero, never carried", () => {
  // The database requires non-negative amounts, so a negative line would be
  // REJECTED at the write rather than stored wrongly. Clamping turns that into
  // a caught condition instead of a 500.
  assert.equal(lineTotalCents({ unitCents: -100, units: 2 }), 0);
  const totals = cartTotals([
    { unitCents: 1000, units: 1 },
    { unitCents: -900, units: 1 },
  ]);
  assert.equal(totals.subtotalCents, 1000, "a negative line must not discount the cart");
  assert.equal(totalsAreWritable(totals), true);
});

test("negative units cannot refund a cart", () => {
  // A quantity stepper that goes below zero must not turn a cart into a credit.
  const totals = cartTotals([
    { unitCents: 1000, units: 2 },
    { unitCents: 1000, units: -5 },
  ]);
  assert.equal(totals.subtotalCents, 2000);
  assert.equal(totalsAreWritable(totals), true);
});

test("totalsAreWritable rejects what the database would reject", () => {
  assert.equal(
    totalsAreWritable({ subtotalCents: 100, discountCents: 0, taxCents: 0, totalCents: 999 }),
    false,
    "a total that is not derived must be caught before the write",
  );
  assert.equal(
    totalsAreWritable({ subtotalCents: -1, discountCents: 0, taxCents: 0, totalCents: -1 }),
    false,
    "a negative amount must be caught before the write",
  );
  assert.equal(
    totalsAreWritable({ subtotalCents: 10.5, discountCents: 0, taxCents: 0, totalCents: 10.5 }),
    false,
    "a fractional amount must be caught before the write",
  );
});

test("a large cart stays exact in integer cents", () => {
  // Floating point would drift here; integers do not.
  const lines = Array.from({ length: 500 }, () => ({ unitCents: 1999, units: 3 }));
  const totals = cartTotals(lines);
  assert.equal(totals.subtotalCents, 1999 * 3 * 500);
  assert.equal(totalsAreWritable(totals), true);
});
