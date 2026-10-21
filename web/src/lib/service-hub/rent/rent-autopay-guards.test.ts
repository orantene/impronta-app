/** TUL-1601 consultant fixes: an abandoned Checkout frees the plan; Stripe is told FIRST when a plan ends or pauses. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import type Stripe from "stripe";
import { decideRentAutopay } from "./rent-autopay";
import { applyRentSubscriptionEvent, type AutopayPlanRow, type RentAutopayApplyDeps } from "./rent-autopay-apply";
import { classifyRentSubscriptionEvent, type RentSubscriptionEvent } from "./rent-autopay-routing";
import { syncRentAutopayWithPlan } from "./rent-autopay.server";
import { decideRentIssue, type RentPlan } from "./rent-cycle";

const md = { checkout_type: "rent_subscription", rent_plan_id: "plan-1", tenant_id: "t-1", rent_cents: "120000" };
const ev = (type: string, object: Record<string, unknown>) => ({ type, data: { object } }) as unknown as Stripe.Event;
const plan = (over: Partial<RentPlan> = {}): RentPlan => ({
  id: "plan-1", tenantId: "t-1", talentProfileId: "tp-1", monthlyRentCents: 120_000, percentBps: 0, currency: "MXN", startsOn: "2026-09-01",
  status: "active", acceptedAt: "x", acceptedAmountCents: 120_000, acceptedPercentBps: 0, acceptedCurrency: "MXN", termsVersion: 1, acceptedTermsVersion: 1, ...over,
});

describe("an abandoned Checkout does not lock the studio out", () => {
  test("checkout.session.expired of a rent subscription is recognised", () => {
    assert.deepEqual(classifyRentSubscriptionEvent(ev("checkout.session.expired", { mode: "subscription", metadata: md })), { type: "expired", planId: "plan-1", tenantId: "t-1" });
    assert.equal(classifyRentSubscriptionEvent(ev("checkout.session.expired", { mode: "subscription", metadata: { checkout_type: "talent_subscription" } })), null);
  });
  function world(row: Partial<AutopayPlanRow>) {
    const state = { plan: { status: "active", autopayStatus: "pending", subscriptionId: null, talentProfileId: "tp-1", ...row } as AutopayPlanRow, cleared: false };
    const deps: RentAutopayApplyDeps = {
      async loadPlan() { return state.plan; },
      async setAutopay(_p, _t, patch) { state.plan = { ...state.plan, autopayStatus: patch.autopayStatus }; if (patch.clearFirstPeriod) state.cleared = true; return true; },
      async loadInvoice() { return null; },
      async writeInvoice() { return true; },
      async cancelSubscription() { return true; },
      async notify() {},
      alert() {},
    };
    return { state, deps };
  }
  const expired: RentSubscriptionEvent = { type: "expired", planId: "plan-1", tenantId: "t-1" };
  test("a pending plan with no subscription goes back to off, and the first-month marker is cleared", async () => {
    const w = world({});
    assert.equal(await applyRentSubscriptionEvent(expired, w.deps), "status_set");
    assert.equal(w.state.plan.autopayStatus, "off");
    assert.equal(w.state.cleared, true);
  });
  test("an expired session never touches a plan that already has a live subscription", async () => {
    const w = world({ autopayStatus: "active", subscriptionId: "sub_1" });
    assert.equal(await applyRentSubscriptionEvent(expired, w.deps), "duplicate");
    assert.equal(w.state.plan.autopayStatus, "active");
  });
  test("pending does not block payment links (no subscription exists yet)", () => {
    const now = new Date("2026-11-20T12:00:00Z");
    assert.equal(decideRentIssue({ plan: plan({ autopayStatus: "pending", autopayFirstPeriod: "2026-11" }), period: "2026-11", now }).ok, true);
    assert.deepEqual(decideRentIssue({ plan: plan({ autopayStatus: "active", autopayFirstPeriod: "2026-11" }), period: "2026-11", now }), { ok: false, reason: "autopay_on" });
  });
  test("the member can start again while pending (the same Checkout session is reused)", () => {
    const base = { plan: plan(), studio: { accountId: "acct", chargesEnabled: true }, feeBps: 150 };
    assert.deepEqual(decideRentAutopay({ ...base, autopayStatus: "pending" }), { ok: true });
    assert.deepEqual(decideRentAutopay({ ...base, autopayStatus: "active" }), { ok: false, reason: "already_on" });
  });
});

describe("a payment on an ended plan is not silent", () => {
  test("it raises an alert, cancels the subscription, and still records the month that was paid", async () => {
    const alerts: string[] = [];
    const cancelled: string[] = [];
    const written: string[] = [];
    const deps: RentAutopayApplyDeps = {
      async loadPlan() { return { status: "ended", autopayStatus: "active", subscriptionId: "sub_1", talentProfileId: "tp-1" }; },
      async setAutopay() { return true; },
      async loadInvoice() { return null; },
      async writeInvoice(r) { written.push(r.status); return true; },
      async cancelSubscription(id) { cancelled.push(id); return true; },
      async notify() {},
      alert(d) { alerts.push(d); },
    };
    const paid: RentSubscriptionEvent = { type: "paid", planId: "plan-1", tenantId: "t-1", subscriptionId: "sub_1", invoiceId: "in_1", periodStart: Date.UTC(2026, 10, 1) / 1000, amountPaid: 121_800, currency: "mxn", rentCents: 120_000 };
    assert.equal(await applyRentSubscriptionEvent(paid, deps), "paid_recorded");
    assert.equal(alerts.length, 1);
    assert.deepEqual(cancelled, ["sub_1"]);
    assert.deepEqual(written, ["paid"]);
  });
});

describe("Stripe is told FIRST; a failure refuses the plan change", () => {
  function fakeAdmin(row: { stripe_subscription_id: string | null; autopay_status: string; autopay_platform?: string | null }) {
    const updates: Array<Record<string, unknown>> = [];
    const q: Record<string, unknown> = {};
    Object.assign(q, {
      select: () => q, eq: () => q,
      maybeSingle: async () => ({ data: row, error: null }),
      update: (p: Record<string, unknown>) => { updates.push(p); return q; },
    });
    return { admin: { from: () => q } as never, updates };
  }
  function fakeStripe(fail: "cancel" | "update" | null) {
    const calls: string[] = [];
    const stripe = {
      subscriptions: {
        cancel: async () => { calls.push("cancel"); if (fail === "cancel") throw new Error("stripe down"); return {}; },
        update: async (_id: string, p: Record<string, unknown>) => { calls.push(`update:${JSON.stringify(p.pause_collection)}`); if (fail === "update") throw new Error("stripe down"); return {}; },
      },
    } as never;
    return { stripe, calls };
  }
  test("no live subscription: nothing to do, the change goes ahead", async () => {
    const f = fakeStripe(null);
    assert.deepEqual(await syncRentAutopayWithPlan(fakeAdmin({ stripe_subscription_id: null, autopay_status: "off" }).admin, { tenantId: "t", planId: "p", planStatus: "ended" }, { stripeFor: () => f.stripe }), { ok: true });
    assert.deepEqual(f.calls, []);
  });
  test("ended: the subscription is cancelled; a Stripe failure returns not ok (the plan must NOT end)", async () => {
    const ok = fakeStripe(null);
    const a = fakeAdmin({ stripe_subscription_id: "sub_1", autopay_status: "active" });
    assert.deepEqual(await syncRentAutopayWithPlan(a.admin, { tenantId: "t", planId: "p", planStatus: "ended" }, { stripeFor: () => ok.stripe }), { ok: true });
    assert.deepEqual(ok.calls, ["cancel"]);
    const bad = fakeStripe("cancel");
    assert.deepEqual(await syncRentAutopayWithPlan(fakeAdmin({ stripe_subscription_id: "sub_1", autopay_status: "active" }).admin, { tenantId: "t", planId: "p", planStatus: "ended" }, { stripeFor: () => bad.stripe }), { ok: false });
  });
  test("paused collects nothing; resumed clears the pause; a failure returns not ok", async () => {
    const f = fakeStripe(null);
    const row = { stripe_subscription_id: "sub_1", autopay_status: "active" };
    await syncRentAutopayWithPlan(fakeAdmin(row).admin, { tenantId: "t", planId: "p", planStatus: "paused" }, { stripeFor: () => f.stripe });
    await syncRentAutopayWithPlan(fakeAdmin(row).admin, { tenantId: "t", planId: "p", planStatus: "active" }, { stripeFor: () => f.stripe });
    assert.deepEqual(f.calls, ['update:{"behavior":"void"}', 'update:""']);
    const bad = fakeStripe("update");
    assert.deepEqual(await syncRentAutopayWithPlan(fakeAdmin(row).admin, { tenantId: "t", planId: "p", planStatus: "paused" }, { stripeFor: () => bad.stripe }), { ok: false });
  });
  test("no Stripe client for a live subscription is a failure, not a silent skip", async () => {
    assert.deepEqual(await syncRentAutopayWithPlan(fakeAdmin({ stripe_subscription_id: "sub_1", autopay_status: "active" }).admin, { tenantId: "t", planId: "p", planStatus: "ended" }, { stripeFor: () => null }), { ok: false });
  });
  test("the actions call Stripe BEFORE they change the plan, and refuse when it fails", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/service-hub/rent/rent-actions.ts"), "utf8");
    const owner = src.slice(src.indexOf("export async function setRentPlanStatus"), src.indexOf("export async function issueRent"));
    assert.ok(owner.indexOf("syncRentAutopayWithPlan(") < owner.indexOf('.update({'), "owner: Stripe first");
    assert.match(owner, /\.ok\)\) return \{ ok: false, reason: "autopay_unavailable" \}|if \(!\(await syncRentAutopayWithPlan\([^)]*\)\)\.ok\)/);
    const member = src.slice(src.indexOf("export async function memberEndRentPlan"));
    assert.ok(member.indexOf("syncRentAutopayWithPlan(") < member.indexOf('.update({ status: "ended"'), "member: Stripe first");
    assert.match(member, /autopay_unavailable/);
  });
});
