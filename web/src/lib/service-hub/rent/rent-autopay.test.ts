import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildRentSubscriptionParams,
  decideRentAutopay,
  nextMonthAnchorSeconds,
  rentAutopayAmounts,
  rentAutopayGate,
} from "./rent-autopay";
import type { RentPlan } from "./rent-cycle";

const plan = (over: Partial<RentPlan> = {}): RentPlan => ({
  id: "plan-1", tenantId: "t-1", talentProfileId: "tp-1",
  monthlyRentCents: 120_000, percentBps: 0, currency: "MXN", startsOn: "2026-09-01",
  status: "active", acceptedAt: "2026-08-30T10:00:00Z",
  acceptedAmountCents: 120_000, acceptedPercentBps: 0, acceptedCurrency: "MXN", termsVersion: 1, acceptedTermsVersion: 1,
  ...over,
});
const studio = { accountId: "acct_studio", chargesEnabled: true };

describe("gate: TEST mode and flag, both", () => {
  test("off unless RENT_AUTOPAY_ENABLED=1 and an sk_test_ key", () => {
    assert.deepEqual(rentAutopayGate({ RENT_AUTOPAY_ENABLED: "1", STRIPE_SECRET_KEY: "sk_test_x" }), { ok: true });
    assert.deepEqual(rentAutopayGate({ STRIPE_SECRET_KEY: "sk_test_x" }), { ok: false, reason: "disabled" });
    assert.deepEqual(rentAutopayGate({ RENT_AUTOPAY_ENABLED: "1", STRIPE_SECRET_KEY: "sk_live_x" }), { ok: false, reason: "not_test_mode" });
  });
});

describe("amounts: the member pays rent + the Tulala fee on top; the studio gets the rent, never more", () => {
  test("fee half-up on the rent; total = rent + fee", () => {
    const a = rentAutopayAmounts(120_000, 150)!;
    assert.equal(a.feeCents, 1_800);
    assert.equal(a.totalCents, 121_800);
  });
  test("the transfer share rounds DOWN so the studio never receives more than the rent", () => {
    for (const [rent, bps] of [[120_000, 150], [99_999, 150], [1_001, 175], [50_000, 0], [12_345, 2_000]] as const) {
      const a = rentAutopayAmounts(rent, bps)!;
      const studioGets = Math.floor((a.totalCents * a.transferPercent) / 100);
      assert.ok(studioGets <= rent, `studio ${studioGets} <= rent ${rent}`);
      // and never short by more than 0.01% of the total plus a cent
      assert.ok(rent - studioGets <= Math.ceil(a.totalCents * 0.0001) + 1, `drift for ${rent}/${bps}: ${rent - studioGets}`);
      assert.ok(Number.isFinite(a.transferPercent) && a.transferPercent <= 100);
      assert.equal(Math.round(a.transferPercent * 100), a.transferPercent * 100, "two decimals");
    }
  });
  test("zero fee: the studio share is 100%", () => {
    assert.equal(rentAutopayAmounts(50_000, 0)!.transferPercent, 100);
  });
  test("invalid inputs fail closed", () => {
    for (const [r, b] of [[0, 150], [-1, 150], [1.5, 150], [100, -1], [100, 2_001], [100, Number.NaN]] as const) assert.equal(rentAutopayAmounts(r, b), null);
  });
});

describe("who may turn on automatic payments", () => {
  const ok = { plan: plan(), studio, feeBps: 150 as number | null, autopayStatus: "off" };
  test("an accepted, active, fixed-rent plan with a ready studio account and a known fee", () => {
    assert.deepEqual(decideRentAutopay(ok), { ok: true });
  });
  test("refusals, each fail closed", () => {
    assert.deepEqual(decideRentAutopay({ ...ok, plan: plan({ acceptedAt: null }) }), { ok: false, reason: "not_accepted" });
    assert.deepEqual(decideRentAutopay({ ...ok, plan: plan({ status: "paused" }) }), { ok: false, reason: "not_active" });
    assert.deepEqual(decideRentAutopay({ ...ok, plan: plan({ percentBps: 1_000, acceptedPercentBps: 1_000 }) }), { ok: false, reason: "percent_rent" });
    assert.deepEqual(decideRentAutopay({ ...ok, plan: plan({ termsVersion: 2 }) }), { ok: false, reason: "terms_changed" });
    assert.deepEqual(decideRentAutopay({ ...ok, studio: { accountId: null, chargesEnabled: false } }), { ok: false, reason: "studio_not_ready" });
    assert.deepEqual(decideRentAutopay({ ...ok, studio: { accountId: "acct", chargesEnabled: false } }), { ok: false, reason: "studio_not_ready" });
    assert.deepEqual(decideRentAutopay({ ...ok, feeBps: null }), { ok: false, reason: "fee_unavailable" });
    assert.deepEqual(decideRentAutopay({ ...ok, plan: plan({ monthlyRentCents: 500, acceptedAmountCents: 500 }) }), { ok: false, reason: "below_minimum" });
    for (const s of ["pending", "active", "past_due", "paused"]) assert.deepEqual(decideRentAutopay({ ...ok, autopayStatus: s }), { ok: false, reason: "already_on" });
  });
});

describe("the first automatic charge is the 1st of NEXT month (this month stays on the payment link)", () => {
  test("UTC first of next month", () => {
    assert.equal(nextMonthAnchorSeconds(new Date("2026-10-20T12:00:00Z")), Date.UTC(2026, 10, 1) / 1000);
    assert.equal(nextMonthAnchorSeconds(new Date("2026-12-31T23:59:59Z")), Date.UTC(2027, 0, 1) / 1000);
  });
});

describe("Checkout session parameters", () => {
  const params = buildRentSubscriptionParams({
    plan: plan(),
    amounts: rentAutopayAmounts(120_000, 150)!,
    customerId: "cus_1",
    studioAccountId: "acct_studio",
    successUrl: "https://app/ok",
    cancelUrl: "https://app/no",
    locale: "es",
    anchorSeconds: 1_790_000_000,
    rentLabel: "Renta de estación",
    feeLabel: "Cargo por servicio de Tulala",
    consent: { consent_collection: { terms_of_service: "required" } },
  });
  test("a monthly subscription on the PLATFORM account, money transferred to the studio", () => {
    assert.equal(params.mode, "subscription");
    assert.equal(params.customer, "cus_1");
    assert.deepEqual(params.subscription_data?.transfer_data, { destination: "acct_studio", amount_percent: rentAutopayAmounts(120_000, 150)!.transferPercent });
    assert.equal(params.subscription_data?.billing_cycle_anchor, 1_790_000_000);
    assert.equal(params.subscription_data?.proration_behavior, "none");
  });
  test("two lines: the rent and the Tulala fee, both monthly, in the plan currency", () => {
    const items = params.line_items ?? [];
    assert.equal(items.length, 2);
    assert.deepEqual(items.map((i) => i.price_data?.unit_amount), [120_000, 1_800]);
    assert.ok(items.every((i) => i.price_data?.currency === "mxn" && i.price_data?.recurring?.interval === "month"));
    assert.deepEqual(items.map((i) => i.price_data?.product_data?.name), ["Renta de estación", "Cargo por servicio de Tulala"]);
  });
  test("routing metadata on both the session and the subscription; consent required", () => {
    for (const md of [params.metadata, params.subscription_data?.metadata]) {
      assert.equal(md?.checkout_type, "rent_subscription");
      assert.equal(md?.rent_plan_id, "plan-1");
      assert.equal(md?.tenant_id, "t-1");
      assert.equal(md?.rent_talent_profile_id, "tp-1");
      assert.equal(md?.talent_profile_id, undefined, "never looks like a talent PLAN subscription to the plan routing");
      assert.equal(md?.rent_cents, "120000");
      assert.equal(md?.terms_version, "1");
    }
    assert.deepEqual(params.consent_collection, { terms_of_service: "required" });
  });
  test("a zero fee sends one line only", () => {
    const p = buildRentSubscriptionParams({ plan: plan(), amounts: rentAutopayAmounts(120_000, 0)!, customerId: "c", studioAccountId: "a", successUrl: "s", cancelUrl: "c", locale: "en", anchorSeconds: 1, rentLabel: "Station rent", feeLabel: "Tulala service fee", consent: {} });
    assert.equal(p.line_items?.length, 1);
  });
});

import { decideRentIssue } from "./rent-cycle";

describe("no double charge between the payment link and the subscription", () => {
  const NOW = new Date("2026-11-20T12:00:00Z");
  test("a month the subscription charges cannot be issued as a payment link", () => {
    const p = plan({ autopayStatus: "active", autopayFirstPeriod: "2026-11" });
    assert.deepEqual(decideRentIssue({ plan: p, period: "2026-11", now: NOW }), { ok: false, reason: "autopay_on" });
  });
  test("earlier months still can (the month it was started stays on its link)", () => {
    const p = plan({ autopayStatus: "active", autopayFirstPeriod: "2026-11" });
    assert.equal(decideRentIssue({ plan: p, period: "2026-10", now: NOW }).ok, true);
  });
  test("once automatic payments are off or cancelled, links work again", () => {
    for (const s of ["off", "canceled"]) {
      assert.equal(decideRentIssue({ plan: plan({ autopayStatus: s, autopayFirstPeriod: "2026-11" }), period: "2026-11", now: NOW }).ok, true);
    }
  });
});
