import { test } from "node:test";
import assert from "node:assert/strict";
import { lineTaxCents, orderTaxCents } from "./tax";

test("unset rate keeps tax at zero", () => {
  assert.equal(
    lineTaxCents({ lineTotalCents: 10000, category: { id: "1", code: "std", label: "Standard", rateBps: null } }),
    0,
  );
});

test("operator rate is applied in basis points, floored", () => {
  assert.equal(
    lineTaxCents({
      lineTotalCents: 10001,
      category: { id: "1", code: "std", label: "Standard", rateBps: 1600 },
    }),
    1600,
  );
});

test("order tax sums per line", () => {
  const cat = { id: "1", code: "std", label: "Standard", rateBps: 1000 };
  assert.equal(
    orderTaxCents([
      { lineTotalCents: 1000, category: cat },
      { lineTotalCents: 2000, category: null },
    ]),
    100,
  );
});
