/**
 * platform-mrr.test.ts — pins the four ways the old "Estimated MRR" lied.
 *
 * Each test below corresponds to one concrete falsehood the Billing page
 * printed to the owner: comped tenants counted as revenue, a fabricated
 * Network price, yearly plans counted at their yearly amount, and discounts
 * ignored entirely. The fifth pins the honest behaviour that replaced the
 * guessing: an unresolvable row is COUNTED AS UNPRICED, not as zero revenue
 * quietly folded in and not as an invented number.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  computeChurn,
  computePlatformMrr,
  resolveMonthlyCents,
  type MrrPriceIndex,
  type MrrSubscriptionRow,
} from "./platform-mrr";

const INDEX: MrrPriceIndex = {
  byStripePriceId: {
    price_studio_m: { unitAmountCents: 4900, interval: "month" },
    price_studio_y: { unitAmountCents: 49000, interval: "year" },
    price_weird: { unitAmountCents: 1000, interval: "week" },
  },
  canonicalMonthlyByTierSlug: {
    studio: 4900,
    agency: 14900,
    pro: 1900,
  },
};

const NOW = new Date("2026-08-27T12:00:00.000Z");

function sub(over: Partial<MrrSubscriptionRow> = {}): MrrSubscriptionRow {
  return {
    side: "workspace",
    planKey: "studio",
    status: "active",
    stripePriceId: "price_studio_m",
    discountPercentOff: null,
    discountAmountOffCents: null,
    discountEndsAt: null,
    cancelledAt: null,
    ...over,
  };
}

test("only active and past_due are billed; trialing is reported, never counted", () => {
  const result = computePlatformMrr(
    [
      sub({ status: "active" }),
      sub({ status: "past_due" }),
      sub({ status: "trialing" }),
      sub({ status: "canceled" }),
      sub({ status: "incomplete_expired" }),
    ],
    INDEX,
    NOW,
  );
  assert.equal(result.payingCount, 2);
  assert.equal(result.pastDueCount, 1);
  assert.equal(result.trialingCount, 1);
  assert.equal(result.mrrCents, 9800);
});

test("comps are excluded by construction — a comp has no subscription row", () => {
  // The old page multiplied a hardcoded price by a COUNT OF TENANTS grouped by
  // agencies.plan_tier, the column a plan override writes onto. Ten comped
  // agency tenants therefore read as $1,490/mo of revenue. Here they simply
  // are not in the input, because they have no subscription: MRR stays zero
  // and no filter had to be remembered.
  const result = computePlatformMrr([], INDEX, NOW);
  assert.equal(result.mrrCents, 0);
  assert.equal(result.payingCount, 0);
});

test("a yearly price contributes one twelfth per month", () => {
  const result = computePlatformMrr(
    [sub({ stripePriceId: "price_studio_y" })],
    INDEX,
    NOW,
  );
  assert.equal(result.mrrCents, Math.round(49000 / 12));
});

test("network has no catalog price, so it is unpriced — not $299", () => {
  // The deleted PLAN_PRICE_CENTS map invented network: 29900. The catalog says
  // the Network tier is sales-assisted with no price at all.
  const row = sub({ planKey: "network", stripePriceId: null });
  assert.equal(resolveMonthlyCents(row, INDEX), null);
  const result = computePlatformMrr([row], INDEX, NOW);
  assert.equal(result.unpricedCount, 1);
  assert.equal(result.payingCount, 0);
  assert.equal(result.mrrCents, 0);
});

test("an unknown plan key or a stale price id falls back, then reports unpriced", () => {
  // Stale id, known plan → falls back to the tier's canonical monthly.
  const stale = sub({ planKey: "agency", stripePriceId: "price_deleted" });
  assert.equal(resolveMonthlyCents(stale, INDEX), 14900);

  // Unknown plan key AND no usable price → unpriced, shown on the page.
  const unknown = sub({ planKey: "mystery", stripePriceId: null });
  assert.equal(resolveMonthlyCents(unknown, INDEX), null);

  // An interval the catalog should never hold is not silently treated as
  // monthly; it falls through to the plan-key fallback.
  const weird = sub({ planKey: "agency", stripePriceId: "price_weird" });
  assert.equal(resolveMonthlyCents(weird, INDEX), 14900);
});

test("talent plan keys resolve through the talent tier slugs", () => {
  const row = sub({ side: "talent", planKey: "talent_pro", stripePriceId: null });
  assert.equal(resolveMonthlyCents(row, INDEX), 1900);
});

test("MRR is net of the discount mirror columns", () => {
  const result = computePlatformMrr(
    [
      sub({ discountPercentOff: 50 }),
      sub({ discountAmountOffCents: 900 }),
      sub(),
    ],
    INDEX,
    NOW,
  );
  assert.equal(result.grossMrrCents, 4900 * 3);
  assert.equal(result.mrrCents, 2450 + 4000 + 4900);
  assert.equal(result.discountCents, 4900 * 3 - (2450 + 4000 + 4900));
});

test("a discount past its end date no longer discounts", () => {
  const lapsed = computePlatformMrr(
    [sub({ discountPercentOff: 100, discountEndsAt: "2026-08-01T00:00:00.000Z" })],
    INDEX,
    NOW,
  );
  assert.equal(lapsed.mrrCents, 4900);

  const live = computePlatformMrr(
    [sub({ discountPercentOff: 100, discountEndsAt: "2026-12-01T00:00:00.000Z" })],
    INDEX,
    NOW,
  );
  assert.equal(live.mrrCents, 0);
  // Still a paying subscriber, just one paying nothing this month.
  assert.equal(live.payingCount, 1);
});

test("a discount can never push a line below zero", () => {
  const result = computePlatformMrr(
    [sub({ discountAmountOffCents: 999999 })],
    INDEX,
    NOW,
  );
  assert.equal(result.mrrCents, 0);
});

test("churn counts cancellations inside the window and nothing outside it", () => {
  const rows = [
    sub({ cancelledAt: "2026-08-20T00:00:00.000Z" }),
    sub({ cancelledAt: "2026-08-26T00:00:00.000Z" }),
    sub({ cancelledAt: "2026-06-01T00:00:00.000Z" }),
    sub({ cancelledAt: null }),
    sub({ cancelledAt: "not-a-date" }),
  ];
  assert.equal(computeChurn(rows, NOW).cancellationCount, 2);
  assert.equal(computeChurn(rows, NOW, 120).cancellationCount, 3);
});

test("churn ignores a future cancellation timestamp", () => {
  const rows = [sub({ cancelledAt: "2027-01-01T00:00:00.000Z" })];
  assert.equal(computeChurn(rows, NOW).cancellationCount, 0);
});
