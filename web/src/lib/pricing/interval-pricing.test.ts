import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_BILLING_INTERVAL,
  YEARLY_PLACEHOLDER_CONFIG,
  maxYearlySavingsPercent,
  parseBillingInterval,
  resolveIntervalPrice,
  yearlySavingsPercent,
} from "./interval-pricing";

const monthOnly = [{ interval: "month", unitAmount: 4900, currency: "USD" }];
const both = [
  ...monthOnly,
  { interval: "year", unitAmount: 46800, currency: "USD" },
];

test("default interval is monthly and unknown input falls back to it", () => {
  assert.equal(DEFAULT_BILLING_INTERVAL, "month");
  assert.equal(parseBillingInterval("year"), "year");
  assert.equal(parseBillingInterval("weekly"), "month");
  assert.equal(parseBillingInterval(undefined), "month");
});

test("monthly resolves from the catalog row", () => {
  const r = resolveIntervalPrice(monthOnly, "month");
  assert.deepEqual(r, {
    interval: "month",
    unitAmount: 4900,
    perMonthAmount: 4900,
    currency: "USD",
    source: "catalog",
  });
});

test("yearly prefers a catalog yearly row when one exists", () => {
  const r = resolveIntervalPrice(both, "year");
  assert.equal(r?.source, "catalog");
  assert.equal(r?.unitAmount, 46800);
  assert.equal(r?.perMonthAmount, 3900);
});

test("yearly falls back to the typed placeholder config, clearly tagged", () => {
  assert.equal(YEARLY_PLACEHOLDER_CONFIG.isPlaceholder, true);
  const r = resolveIntervalPrice(monthOnly, "year");
  assert.equal(r?.source, "placeholder");
  assert.equal(
    r?.unitAmount,
    4900 * YEARLY_PLACEHOLDER_CONFIG.monthsChargedPerYear,
  );
  assert.equal(r?.perMonthAmount, Math.round(49000 / 12));
});

test("a tier with no recurring price resolves to null for both intervals", () => {
  assert.equal(resolveIntervalPrice([], "month"), null);
  assert.equal(resolveIntervalPrice([], "year"), null);
});

test("savings percent rounds and never goes negative", () => {
  assert.equal(yearlySavingsPercent(4900, 49000), 17);
  assert.equal(yearlySavingsPercent(4900, 46800), 20);
  assert.equal(yearlySavingsPercent(4900, 58800), 0);
  assert.equal(yearlySavingsPercent(4900, 70000), 0);
  assert.equal(yearlySavingsPercent(0, 0), 0);
  assert.equal(
    maxYearlySavingsPercent([
      { monthly: 4900, yearly: 49000 },
      { monthly: 4900, yearly: 46800 },
    ]),
    20,
  );
  assert.equal(maxYearlySavingsPercent([]), 0);
});
