import { test } from "node:test";
import assert from "node:assert/strict";
import { lineTax, orderTax, taxCentsOr } from "./tax";

const cat = (rateBps: number | null) => ({ id: "1", code: "std", label: "Standard", rateBps });

test("an unset rate is not a zero rate", () => {
  const noCategory = lineTax({ lineTotalCents: 10000, category: null });
  assert.equal(noCategory.kind, "unset");
  assert.equal("cents" in noCategory, false, "an unset outcome must not carry cents");
  assert.equal("rateBps" in noCategory, false, "an unset outcome must not carry a rate");

  const unratedCategory = lineTax({ lineTotalCents: 10000, category: cat(null) });
  assert.equal(unratedCategory.kind, "unset");
});

test("an operator-entered zero IS a rate and still renders", () => {
  const zero = lineTax({ lineTotalCents: 10000, category: cat(0) });
  assert.equal(zero.kind, "taxed");
  if (zero.kind !== "taxed") return;
  assert.equal(zero.rateBps, 0);
  assert.equal(zero.cents, 0);
});

test("operator rate is applied in basis points, floored", () => {
  const taxed = lineTax({ lineTotalCents: 10001, category: cat(1600) });
  assert.equal(taxed.kind, "taxed");
  if (taxed.kind !== "taxed") return;
  assert.equal(taxed.cents, 1600);
  assert.equal(taxed.rateBps, 1600);
});

test("order tax sums the configured lines and counts the uncategorised ones", () => {
  const total = orderTax([
    { lineTotalCents: 1000, category: cat(1000) },
    { lineTotalCents: 2000, category: null },
  ]);
  assert.equal(total.kind, "taxed");
  if (total.kind !== "taxed") return;
  assert.equal(total.cents, 100);
  assert.equal(total.unsetLines, 1, "the uncategorised line is reported, not hidden inside the sum");
});

test("an order where nothing is categorised has no tax figure at all", () => {
  const total = orderTax([
    { lineTotalCents: 1000, category: null },
    { lineTotalCents: 2000, category: cat(null) },
  ]);
  assert.equal(total.kind, "unset");
  assert.equal("cents" in total, false);
});

test("an order of operator zeroes reports zero cents, not absence", () => {
  const total = orderTax([{ lineTotalCents: 1000, category: cat(0) }]);
  assert.equal(total.kind, "taxed");
  if (total.kind !== "taxed") return;
  assert.equal(total.cents, 0);
  assert.equal(total.unsetLines, 0);
});

test("taxCentsOr makes the caller name what absence means", () => {
  assert.equal(taxCentsOr(lineTax({ lineTotalCents: 1000, category: null }), 0), 0);
  assert.equal(taxCentsOr(lineTax({ lineTotalCents: 1000, category: cat(2100) }), 0), 210);
});
