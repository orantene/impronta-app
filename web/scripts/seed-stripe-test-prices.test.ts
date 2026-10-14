import assert from "node:assert/strict";
import { test } from "node:test";

import { assertTestKey, lookupKeyFor, plannedPrices } from "./seed-stripe-test-prices.mjs";

const tiers = [
  { id: "t1", slug: "pro", name: "Pro", is_active: true },
  { id: "t2", slug: "max", name: "Portfolio", is_active: true },
  { id: "t3", slug: "website", name: "Website", is_active: false },
  { id: "t4", slug: "hub", name: "Hub", is_active: true },
];
const base = { currency: "USD", valid_from: null, valid_until: null };

test("refuses live keys and anything not sk_test_", () => {
  assert.throws(() => assertTestKey("STRIPE_SECRET_KEY", "sk_live_abc"), /not a TEST key/);
  assert.throws(() => assertTestKey("STRIPE_SECRET_KEY", "rk_test_abc"), /not a TEST key/);
  assert.equal(assertTestKey("STRIPE_SECRET_KEY", "sk_test_abc"), "sk_test_abc");
  assert.equal(assertTestKey("STRIPE_MX_SECRET_KEY", undefined), null);
});

test("amounts come from the catalog only; yearly only where the catalog has one", () => {
  const out = plannedPrices(tiers, [
    { ...base, tier_id: "t1", interval: "month", unit_amount: 111 },
    { ...base, tier_id: "t1", interval: "year", unit_amount: 999 },
    { ...base, tier_id: "t2", interval: "month", unit_amount: 222 },
  ]);
  assert.deepEqual(out.map((p: { lookupKey: string; unitAmount: number }) => [p.lookupKey, p.unitAmount]), [
    ["tulala_talent_portfolio_month_usd", 222],
    ["tulala_talent_pro_month_usd", 111],
    ["tulala_talent_pro_year_usd", 999],
  ]);
});

test("skips sale windows, non-USD, inactive tiers, unknown tiers and empty amounts", () => {
  const out = plannedPrices(tiers, [
    { ...base, tier_id: "t1", interval: "month", unit_amount: 111, valid_from: "2026-01-01" },
    { ...base, tier_id: "t1", interval: "month", unit_amount: 111, currency: "MXN" },
    { ...base, tier_id: "t3", interval: "month", unit_amount: 50 },
    { ...base, tier_id: "t4", interval: "month", unit_amount: 50 },
    { ...base, tier_id: "t2", interval: "month", unit_amount: null },
    { ...base, tier_id: "t2", interval: "once", unit_amount: 50 },
  ]);
  assert.deepEqual(out, []);
});

test("lookup keys are stable per plan and interval", () => {
  assert.equal(lookupKeyFor("studio", "year"), "tulala_studio_year_usd");
});
