import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatDashboardMoney } from "./dashboard-money-format";

const nb = (s: string) => s.replace(/ /g, " ");

describe("formatDashboardMoney (DS-17: one dashboard money format)", () => {
  it("MXN prints symbol + amount + code", () => {
    assert.equal(nb(formatDashboardMoney(700, "MXN", "en")), "$700 MXN");
    assert.equal(nb(formatDashboardMoney(700, "MXN", "es")), "$700 MXN");
  });
  it("USD uses the same rule (not US$)", () => {
    assert.equal(nb(formatDashboardMoney(700, "USD", "en")), "$700 USD");
    assert.equal(nb(formatDashboardMoney(700, "USD", "es")), "$700 USD");
  });
  it("zero", () => {
    assert.equal(nb(formatDashboardMoney(0, "USD")), "$0 USD");
    assert.equal(nb(formatDashboardMoney(0, "MXN", "es")), "$0 MXN");
  });
  it("large amounts group", () => {
    assert.equal(nb(formatDashboardMoney(1234567, "MXN", "en")), "$1,234,567 MXN");
    assert.equal(nb(formatDashboardMoney(12000, "MXN", "es")), "$12,000 MXN");
  });
  it("es vs en grouping follows the currency's home market", () => {
    assert.equal(nb(formatDashboardMoney(12000, "EUR", "en")), "€12,000 EUR");
    assert.equal(nb(formatDashboardMoney(12000, "EUR", "es")), "€12.000 EUR");
  });
  it("cents keep two decimals unless whole units are requested", () => {
    assert.equal(nb(formatDashboardMoney(300.5, "MXN")), "$300.50 MXN");
    assert.equal(nb(formatDashboardMoney(300.5, "MXN", "en", { wholeUnits: true })), "$301 MXN");
  });
  it("blank code falls back to USD, lower case is normalised", () => {
    assert.equal(nb(formatDashboardMoney(5, "")), "$5 USD");
    assert.equal(nb(formatDashboardMoney(5, null)), "$5 USD");
    assert.equal(nb(formatDashboardMoney(5, "mxn")), "$5 MXN");
  });
  it("an unknown code never throws and keeps the code", () => {
    assert.equal(nb(formatDashboardMoney(100, "ZZZ")), "100 ZZZ");
  });
});
