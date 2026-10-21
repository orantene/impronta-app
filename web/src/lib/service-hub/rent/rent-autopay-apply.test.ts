import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { applyRentSubscriptionEvent, type AutopayInvoiceRow, type AutopayPlanRow, type RentAutopayApplyDeps } from "./rent-autopay-apply";
import type { RentSubscriptionEvent } from "./rent-autopay-routing";

/** The events this applier takes (a draft invoice goes to the percentage step, not here). */
type AppliedEvent = Exclude<RentSubscriptionEvent, { type: "draft" }>;

const OCT1 = Date.UTC(2026, 9, 1) / 1000;
function world(plan: Partial<AutopayPlanRow> | null = {}) {
  const state = {
    plan: plan ? ({ status: "active", autopayStatus: "off", subscriptionId: null, talentProfileId: "tp-1", ...plan } as AutopayPlanRow) : null,
    invoices: new Map<string, AutopayInvoiceRow & { amountCents: number }>(),
    cancelled: [] as string[],
    notified: [] as string[],
    alerts: [] as string[],
  };
  const deps: RentAutopayApplyDeps = {
    async loadPlan() { return state.plan; },
    async setAutopay(_p, _t, patch) {
      if (!state.plan) return false;
      state.plan = { ...state.plan, autopayStatus: patch.autopayStatus, ...(patch.subscriptionId !== undefined ? { subscriptionId: patch.subscriptionId } : {}) };
      return true;
    },
    async loadInvoice(_p, _t, period) { return state.invoices.get(period) ?? null; },
    async writeInvoice(row) { state.invoices.set(row.period, { status: row.status, stripeInvoiceId: row.stripeInvoiceId, source: "autopay", amountCents: row.amountCents }); return true; },
    async cancelSubscription(id) { state.cancelled.push(id); return true; },
    async notify(kind) { state.notified.push(kind); },
    alert(d) { state.alerts.push(d); },
  };
  return { deps, state };
}
const base = { planId: "plan-1", tenantId: "t-1", subscriptionId: "sub_1" };
const started: AppliedEvent = { type: "started", ...base, customerId: "cus_1" };
const paid = (invoiceId = "in_1"): AppliedEvent => ({ type: "paid", ...base, invoiceId, periodStart: OCT1, amountPaid: 121_800, currency: "mxn", rentCents: 120_000 });
const failed: AppliedEvent = { type: "failed", ...base, invoiceId: "in_1", periodStart: OCT1, attempt: 1, currency: "mxn", rentCents: 120_000 };

describe("starting", () => {
  test("links the subscription to the plan; a replay is a no-op", async () => {
    const w = world();
    assert.equal(await applyRentSubscriptionEvent(started, w.deps), "linked");
    assert.equal(w.state.plan?.subscriptionId, "sub_1");
    assert.equal(await applyRentSubscriptionEvent(started, w.deps), "duplicate");
  });
  test("a SECOND live subscription for the same plan is cancelled, never kept (no double charge)", async () => {
    const w = world({ subscriptionId: "sub_0", autopayStatus: "active" });
    assert.equal(await applyRentSubscriptionEvent(started, w.deps), "cancelled_second_subscription");
    assert.deepEqual(w.state.cancelled, ["sub_1"]);
    assert.equal(w.state.plan?.subscriptionId, "sub_0");
  });
  test("a subscription that lands after the plan was ended or paused is cancelled", async () => {
    const w = world({ status: "ended" });
    assert.equal(await applyRentSubscriptionEvent(started, w.deps), "cancelled_second_subscription");
  });
  test("unknown plan: nothing happens", async () => {
    assert.equal(await applyRentSubscriptionEvent(started, world(null).deps), "plan_not_found");
  });
});

describe("payments", () => {
  test("a paid invoice records the month as paid (rent part), once", async () => {
    const w = world({ subscriptionId: "sub_1", autopayStatus: "active" });
    assert.equal(await applyRentSubscriptionEvent(paid(), w.deps), "paid_recorded");
    assert.deepEqual(w.state.invoices.get("2026-10"), { status: "paid", stripeInvoiceId: "in_1", source: "autopay", amountCents: 120_000 });
    assert.equal(await applyRentSubscriptionEvent(paid(), w.deps), "duplicate");
  });
  test("events of another subscription are ignored", async () => {
    const w = world({ subscriptionId: "sub_other", autopayStatus: "active" });
    assert.equal(await applyRentSubscriptionEvent(paid(), w.deps), "ignored_other_subscription");
    assert.equal(w.state.invoices.size, 0);
  });
  test("a month already paid by a payment link raises a loud alert and is not overwritten", async () => {
    const w = world({ subscriptionId: "sub_1", autopayStatus: "active" });
    w.state.invoices.set("2026-10", { status: "paid", stripeInvoiceId: null, source: "link", amountCents: 120_000 });
    assert.equal(await applyRentSubscriptionEvent(paid(), w.deps), "double_payment_alert");
    assert.equal(w.state.alerts.length, 1);
    assert.equal(w.state.invoices.get("2026-10")?.source, "link");
  });
  test("a failed charge marks the month failed, sets past due via the status event, and tells the member", async () => {
    const w = world({ subscriptionId: "sub_1", autopayStatus: "active" });
    assert.equal(await applyRentSubscriptionEvent(failed, w.deps), "failed_recorded");
    assert.equal(w.state.invoices.get("2026-10")?.status, "failed");
    assert.deepEqual(w.state.notified, ["autopay_failed"]);
    assert.equal(await applyRentSubscriptionEvent(failed, w.deps), "duplicate", "a replay does not notify twice");
    assert.equal(w.state.notified.length, 1);
  });
  test("a retry that succeeds after a failure records the payment and clears past due", async () => {
    const w = world({ subscriptionId: "sub_1", autopayStatus: "past_due" });
    await applyRentSubscriptionEvent(failed, w.deps);
    assert.equal(await applyRentSubscriptionEvent(paid(), w.deps), "paid_recorded");
    assert.equal(w.state.invoices.get("2026-10")?.status, "paid");
    assert.equal(w.state.plan?.autopayStatus, "active");
  });
});

describe("status", () => {
  test("cancelled subscription: autopay off and the member is told", async () => {
    const w = world({ subscriptionId: "sub_1", autopayStatus: "active" });
    assert.equal(await applyRentSubscriptionEvent({ type: "status", ...base, stripeStatus: "canceled", paused: false, deleted: true }, w.deps), "status_set");
    assert.equal(w.state.plan?.autopayStatus, "canceled");
    assert.deepEqual(w.state.notified, ["autopay_canceled"]);
  });
});
