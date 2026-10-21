import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { currentRentPeriod, decideRentIssue, matchesAcceptedTerms, rentLineLabel, rentLinkState, validateRentProposal, type RentPlan } from "./rent-cycle";
import { rentBillingGate } from "./rent-gate";

const plan = (over: Partial<RentPlan> = {}): RentPlan => ({
  id: "plan-1",
  tenantId: "t-1",
  talentProfileId: "tp-1",
  monthlyRentCents: 120000,
  percentBps: 0,
  currency: "MXN",
  startsOn: "2026-09-01",
  status: "active",
  acceptedAt: "2026-08-30T10:00:00Z",
  acceptedAmountCents: 120000,
  acceptedPercentBps: 0,
  acceptedCurrency: "MXN",
  termsVersion: 1,
  acceptedTermsVersion: 1,
  ...over,
});
const NOW = new Date("2026-10-20T12:00:00Z");

describe("rent proposal validation", () => {
  test("accepts a normal rent", () => {
    assert.deepEqual(validateRentProposal({ monthlyRentCents: 120000, currency: "MXN", startsOn: "2026-09-01" }), { ok: true });
  });
  test("refuses zero, negative, fractional and huge amounts, bad currency and bad dates", () => {
    for (const monthlyRentCents of [0, -1, 1.5, 100_000_001, Number.NaN]) {
      assert.equal(validateRentProposal({ monthlyRentCents, currency: "MXN", startsOn: "2026-09-01" }).ok, false);
    }
    assert.deepEqual(validateRentProposal({ monthlyRentCents: 1, currency: "mxn", startsOn: "2026-09-01" }), { ok: false, reason: "currency" });
    assert.deepEqual(validateRentProposal({ monthlyRentCents: 1, currency: "MXN", startsOn: "01/09/2026" }), { ok: false, reason: "starts_on" });
  });
});

describe("which months may be invoiced", () => {
  test("an accepted, active plan is billed its own rent for the current month", () => {
    assert.deepEqual(decideRentIssue({ plan: plan(), period: "2026-10", now: NOW }), { ok: true, amountCents: 120000, currency: "MXN" });
  });
  test("an earlier month after the start is allowed (catch-up), the start month too", () => {
    assert.equal(decideRentIssue({ plan: plan(), period: "2026-09", now: NOW }).ok, true);
  });
  test("a month before the plan starts, or one that has not begun, is refused", () => {
    assert.deepEqual(decideRentIssue({ plan: plan(), period: "2026-08", now: NOW }), { ok: false, reason: "before_start" });
    assert.deepEqual(decideRentIssue({ plan: plan(), period: "2026-11", now: NOW }), { ok: false, reason: "future_period" });
  });
  test("a plan the member has not accepted is never billed, whatever its status says", () => {
    assert.deepEqual(decideRentIssue({ plan: plan({ acceptedAt: null, status: "active" }), period: "2026-10", now: NOW }), { ok: false, reason: "not_accepted" });
    assert.deepEqual(decideRentIssue({ plan: plan({ acceptedAt: null, status: "proposed" }), period: "2026-10", now: NOW }), { ok: false, reason: "not_accepted" });
  });
  test("paused, ended and declined plans are not billed", () => {
    for (const status of ["paused", "ended", "declined", "proposed"] as const) {
      assert.deepEqual(decideRentIssue({ plan: plan({ status }), period: "2026-10", now: NOW }), { ok: false, reason: "not_active" });
    }
  });
  test("a malformed period or stored amount fails closed", () => {
    for (const period of ["2026-13", "2026-1", "202610", "", "2026-10-01"]) {
      assert.deepEqual(decideRentIssue({ plan: plan(), period, now: NOW }), { ok: false, reason: "bad_period" });
    }
    assert.deepEqual(decideRentIssue({ plan: plan({ monthlyRentCents: 0 }), period: "2026-10", now: NOW }), { ok: false, reason: "bad_amount" });
  });
  test("the month rolls at Mexico City midnight (06:00 UTC)", () => {
    assert.equal(currentRentPeriod(new Date("2026-11-01T05:59:59Z")), "2026-10");
    assert.equal(currentRentPeriod(new Date("2026-11-01T06:00:00Z")), "2026-11");
  });
});

describe("invoice line label", () => {
  test("is written in the member's language", () => {
    assert.match(rentLineLabel("2026-10", "en"), /^Station rent, October 2026$/);
    assert.match(rentLineLabel("2026-10", "es"), /^Renta de estación, octubre de 2026$/);
  });
});

describe("test-mode gate", () => {
  test("off unless the flag is exactly 1", () => {
    for (const v of [undefined, "", "0", "true", "yes"]) {
      assert.deepEqual(rentBillingGate({ RENT_BILLING_ENABLED: v, STRIPE_SECRET_KEY: "sk_test_x" }), { ok: false, reason: "disabled" });
    }
  });
  test("on only with a Stripe TEST key: a live, missing or odd key refuses", () => {
    assert.deepEqual(rentBillingGate({ RENT_BILLING_ENABLED: "1", STRIPE_SECRET_KEY: "sk_test_abc" }), { ok: true });
    for (const k of ["sk_live_abc", "", undefined, "rk_live_x", "mock"]) {
      assert.deepEqual(rentBillingGate({ RENT_BILLING_ENABLED: "1", STRIPE_SECRET_KEY: k }), { ok: false, reason: "not_test_mode" });
    }
  });
});

describe("what the member accepted", () => {
  const inv = { amountCents: 120000, currency: "MXN" };
  test("an invoice equal to the accepted amount, currency and terms version matches", () => {
    assert.equal(matchesAcceptedTerms(plan(), inv), true);
  });
  test("any difference does not match: other amount, other currency, newer terms, nothing recorded", () => {
    assert.equal(matchesAcceptedTerms(plan(), { ...inv, amountCents: 130000 }), false);
    assert.equal(matchesAcceptedTerms(plan(), { ...inv, currency: "USD" }), false);
    assert.equal(matchesAcceptedTerms(plan({ termsVersion: 2 }), inv), false);
    assert.equal(matchesAcceptedTerms(plan({ acceptedAmountCents: null, acceptedCurrency: null, acceptedTermsVersion: null }), inv), false);
    assert.equal(matchesAcceptedTerms(plan({ acceptedAt: null }), inv), false);
  });
});

describe("what the owner sees for a month's link", () => {
  test("open link waits, paid is paid, dead links ask for a new one", () => {
    assert.equal(rentLinkState("issued", "open"), "waiting");
    assert.equal(rentLinkState("issued", "paid"), "paid");
    assert.equal(rentLinkState("paid", null), "paid");
    for (const l of ["expired", "cancelled", "failed"]) assert.equal(rentLinkState("issued", l), "needs_new_link");
    assert.equal(rentLinkState("failed", "open"), "needs_new_link");
    assert.equal(rentLinkState("issuing", null), "needs_new_link");
    assert.equal(rentLinkState("void", "open"), "none");
    assert.equal(rentLinkState("issued", null), "none");
  });
});
