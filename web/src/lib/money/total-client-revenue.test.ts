import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  centsToTotalClientRevenue,
  majorMoneyToCents,
  totalClientRevenueToCents,
} from "./total-client-revenue";

describe("totalClientRevenueToCents", () => {
  it("converts major MXN 950.00 to 95000 centavos", () => {
    assert.equal(totalClientRevenueToCents(950), 95_000);
    assert.equal(totalClientRevenueToCents(950.0), 95_000);
    assert.equal(totalClientRevenueToCents("950.00"), 95_000);
  });

  it("rounds half-up on fractional major units", () => {
    assert.equal(majorMoneyToCents(10.005), 1001);
    assert.equal(majorMoneyToCents("19.99"), 1999);
  });

  it("treats null/empty/non-finite as 0", () => {
    assert.equal(totalClientRevenueToCents(null), 0);
    assert.equal(totalClientRevenueToCents(undefined), 0);
    assert.equal(totalClientRevenueToCents(""), 0);
    assert.equal(totalClientRevenueToCents("nope"), 0);
    assert.equal(totalClientRevenueToCents(Number.NaN), 0);
  });

  it("never returns negative", () => {
    assert.equal(totalClientRevenueToCents(-12.5), 0);
  });
});

describe("centsToTotalClientRevenue", () => {
  it("writes major units for bookers", () => {
    assert.equal(centsToTotalClientRevenue(95_000), 950);
    assert.equal(centsToTotalClientRevenue(0), 0);
    assert.equal(centsToTotalClientRevenue(-1), 0);
  });
});
