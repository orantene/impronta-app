import test from "node:test";
import assert from "node:assert/strict";
import { selectDiscountsEndingSoon, type SubscriptionDiscountRow } from "./discount-ending-window";

const NOW = new Date("2026-06-01T00:00:00.000Z");

function row(over: Partial<SubscriptionDiscountRow>): SubscriptionDiscountRow {
  return {
    stripe_subscription_id: "sub_1",
    plan_key: "agency",
    status: "active",
    discount_ends_at: null,
    ...over,
  };
}

test("selects a discount lapsing inside the window", () => {
  const rows = [row({ discount_ends_at: "2026-06-03T00:00:00.000Z" })];
  assert.equal(selectDiscountsEndingSoon(rows, NOW, 3).length, 1);
});

test("ignores a discount lapsing beyond the window", () => {
  const rows = [row({ discount_ends_at: "2026-06-20T00:00:00.000Z" })];
  assert.equal(selectDiscountsEndingSoon(rows, NOW, 3).length, 0);
});

test("never warns about a discount that ALREADY lapsed", () => {
  // A warning after the bigger invoice reads as an apology, not a heads-up.
  const rows = [row({ discount_ends_at: "2026-05-20T00:00:00.000Z" })];
  assert.equal(selectDiscountsEndingSoon(rows, NOW, 3).length, 0);
});

test("treats the horizon as inclusive and 'now' as exclusive", () => {
  const exactlyHorizon = [row({ discount_ends_at: "2026-06-04T00:00:00.000Z" })];
  assert.equal(selectDiscountsEndingSoon(exactlyHorizon, NOW, 3).length, 1);
  const exactlyNow = [row({ discount_ends_at: NOW.toISOString() })];
  assert.equal(selectDiscountsEndingSoon(exactlyNow, NOW, 3).length, 0);
});

test("a malformed date means no mail, never mail-everyone", () => {
  const rows = [row({ discount_ends_at: "not-a-date" })];
  assert.equal(selectDiscountsEndingSoon(rows, NOW, 3).length, 0);
});

test("skips rows with no Stripe subscription to reference", () => {
  const rows = [row({ discount_ends_at: "2026-06-02T00:00:00.000Z", stripe_subscription_id: null })];
  assert.equal(selectDiscountsEndingSoon(rows, NOW, 3).length, 0);
});
