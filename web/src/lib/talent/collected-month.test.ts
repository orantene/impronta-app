/**
 * QA bounce (no ticket number): the Today "Dinero" card read "Octubre · USD
 * $0 USD" for a talent whose account currency is MXN. `todayMoneyCardCurrency`
 * is the pure decision behind the fix: a month that collected something keeps
 * its own real currency; a genuine $0 month shows the talent's own account
 * currency instead of whatever the earnings bundle happened to carry.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { todayMoneyCardCurrency } from "./collected-month";

describe("todayMoneyCardCurrency", () => {
  it("a $0 month shows the talent's own account currency, not the bundle's", () => {
    assert.equal(
      todayMoneyCardCurrency({ cents: 0, currency: "USD" }, "MXN"),
      "MXN",
    );
  });

  it("a non-zero month keeps its own real currency, even if it differs from the account currency", () => {
    assert.equal(
      todayMoneyCardCurrency({ cents: 150_000, currency: "USD" }, "MXN"),
      "USD",
    );
  });

  it("no account currency given: falls back to the bundle's currency on a $0 month (never invents one)", () => {
    assert.equal(todayMoneyCardCurrency({ cents: 0, currency: "USD" }, null), "USD");
  });

  it("no month data at all: the account currency alone, else null", () => {
    assert.equal(todayMoneyCardCurrency(null, "MXN"), "MXN");
    assert.equal(todayMoneyCardCurrency(null, null), null);
  });
});
