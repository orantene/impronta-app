import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";

import { confirmPlanChange, previewPlanChange, type PlanChangeRequest, type PlanChangeStripe } from "./plan-change";
import { planChangeCopyKey } from "./plan-change-policy";

/**
 * TUL-1297: switching the SAME plan between monthly and yearly is a real change
 * (preview with the new interval's price and start, confirm swaps the price on
 * the existing subscription), never "you already have this plan".
 */

type Call = { method: string; args: unknown[] };
type PriceFake = { unit_amount: number | null; currency: string | null };

const NOW = 1_800_000_000_000;
const TRIAL_END = 1_800_000_000 + 9 * 86_400;
const PERIOD_END = 2_000_000_000;

function fakeSub(over: { interval?: "month" | "year"; trialEnd?: number } = {}): Stripe.Subscription {
  return {
    id: "sub_1",
    status: over.trialEnd ? "trialing" : "active",
    trial_end: over.trialEnd ?? null,
    customer: "cus_1",
    schedule: null,
    metadata: { plan_key: "talent_portfolio", talent_profile_id: "tp_1" },
    items: {
      data: [
        {
          id: "si_1",
          current_period_start: 1_000,
          current_period_end: over.trialEnd ?? PERIOD_END,
          price: { id: "price_month", currency: "mxn", recurring: { interval: over.interval ?? "month" } },
        },
      ],
    },
  } as unknown as Stripe.Subscription;
}

function fakeStripe(sub: Stripe.Subscription, calls: Call[], price: PriceFake = { unit_amount: 90_000, currency: "mxn" }, dueToday = 0): PlanChangeStripe {
  const rec = (method: string, ret: unknown) => async (...args: unknown[]) => {
    calls.push({ method, args });
    return ret;
  };
  return {
    subscriptions: { retrieve: rec("subscriptions.retrieve", sub), update: rec("subscriptions.update", sub) },
    invoices: { createPreview: rec("invoices.createPreview", { amount_due: dueToday, currency: "mxn" }) },
    prices: { retrieve: rec("prices.retrieve", price) },
    subscriptionSchedules: {
      create: rec("schedules.create", { id: "sub_sched_new", phases: [{ start_date: 900 }] }),
      update: rec("schedules.update", { id: "sub_sched_new" }),
      release: rec("schedules.release", { id: "sub_sched_old" }),
      retrieve: rec("schedules.retrieve", { id: "sub_sched_old", current_phase: { start_date: 950 }, phases: [] }),
    },
  } as unknown as PlanChangeStripe;
}

const toYear = (over: Partial<PlanChangeRequest> = {}): PlanChangeRequest => ({
  kind: "talent",
  subjectId: "tp_1",
  subscriptionId: "sub_1",
  toPlan: "talent_portfolio",
  toInterval: "year",
  toPriceId: "price_year",
  ...over,
});

test("(a) trialing, same plan month -> year: a real change with the yearly price, trial end as start, nothing today", async () => {
  const calls: Call[] = [];
  const stripe = fakeStripe(fakeSub({ trialEnd: TRIAL_END }), calls);
  const p = await previewPlanChange(stripe, toYear(), NOW);
  assert.ok(p.ok);
  assert.equal(p.kind, "interval_up");
  assert.equal(p.fromInterval, "month");
  assert.equal(p.toInterval, "year");
  assert.deepEqual(p.newPrice, { amount: 90_000, currency: "mxn" });
  assert.equal(p.amountDueToday, 0);
  assert.equal(p.effectiveAt, new Date(TRIAL_END * 1000).toISOString());
  assert.equal(planChangeCopyKey(p), "switchYearlyAt");
  const priceCall = calls.find((c) => c.method === "prices.retrieve");
  assert.equal(priceCall?.args[0], "price_year");
});

test("(a) active, same plan month -> year: pay the prorated amount today; year -> month starts at period end", async () => {
  const calls: Call[] = [];
  const up = await previewPlanChange(fakeStripe(fakeSub(), calls, undefined, 123_400), toYear(), NOW);
  assert.ok(up.ok);
  assert.equal(up.kind, "interval_up");
  assert.equal(up.amountDueToday, 123_400);
  assert.equal(planChangeCopyKey(up), "switchYearlyNow");

  const down = await previewPlanChange(
    fakeStripe(fakeSub({ interval: "year" }), calls, { unit_amount: 9_000, currency: "mxn" }),
    toYear({ toInterval: "month", toPriceId: "price_month" }),
    NOW,
  );
  assert.ok(down.ok);
  assert.equal(down.kind, "interval_down");
  assert.equal(down.timing, "period_end");
  assert.deepEqual(down.newPrice, { amount: 9_000, currency: "mxn" });
  assert.equal(down.effectiveAt, new Date(PERIOD_END * 1000).toISOString());
  assert.equal(planChangeCopyKey(down), "switchMonthlyAt");
});

test("(b) same plan, same interval: no change, no confirm, no price lookup", async () => {
  const calls: Call[] = [];
  const p = await previewPlanChange(fakeStripe(fakeSub(), calls), toYear({ toInterval: "month", toPriceId: "price_month" }), NOW);
  assert.ok(p.ok);
  assert.equal(p.kind, "noop");
  assert.equal(p.newPrice, null);
  assert.equal(planChangeCopyKey(p), "noChange");
  assert.equal(calls.some((c) => c.method === "prices.retrieve" || c.method === "invoices.createPreview"), false);
});

test("(c) confirm month -> year swaps the price on the SAME subscription once; no schedule, no second subscription", async () => {
  const calls: Call[] = [];
  const stripe = fakeStripe(fakeSub({ trialEnd: TRIAL_END }), calls);
  const p = await previewPlanChange(stripe, toYear(), NOW);
  assert.ok(p.ok);
  const out = await confirmPlanChange(stripe, toYear(), p.prorationDate, NOW);
  assert.ok(out.ok);
  assert.equal(out.kind, "interval_up");
  const updates = calls.filter((c) => c.method === "subscriptions.update");
  assert.equal(updates.length, 1);
  const [id, params] = updates[0].args as [string, { items: { id: string; price: string }[]; metadata: Record<string, string> }];
  assert.equal(id, "sub_1");
  assert.deepEqual(params.items, [{ id: "si_1", price: "price_year" }]);
  assert.equal(params.metadata.billing_interval, "year");
  assert.equal(params.metadata.plan_key, "talent_portfolio");
  assert.equal(calls.some((c) => c.method.startsWith("schedules.") || c.method.includes("checkout")), false);
});

test("(d) a missing or unusable yearly price is refused before any change", async () => {
  const calls: Call[] = [];
  const stripe = fakeStripe(fakeSub(), calls);
  const noId = await previewPlanChange(stripe, toYear({ toPriceId: null }), NOW);
  assert.equal(!noId.ok && noId.code, "no_price");
  const noConfirm = await confirmPlanChange(stripe, toYear({ toPriceId: null }), Math.floor(NOW / 1000), NOW);
  assert.equal(!noConfirm.ok && noConfirm.code, "no_price");

  for (const bad of [{ unit_amount: null, currency: "mxn" }, { unit_amount: 90_000, currency: null }] as PriceFake[]) {
    const c2: Call[] = [];
    const p = await previewPlanChange(fakeStripe(fakeSub(), c2, bad), toYear(), NOW);
    assert.equal(!p.ok && p.code, "no_price");
  }
  assert.equal(calls.some((c) => c.method === "subscriptions.update"), false);
});

test("copy keys: interval changes never use the plain upgrade or no-change sentences", () => {
  assert.equal(planChangeCopyKey({ kind: "interval_up", timing: "now", amountDueToday: 500, effectiveAt: null }), "switchYearlyNow");
  assert.equal(planChangeCopyKey({ kind: "interval_up", timing: "now", amountDueToday: 0, effectiveAt: "2026-11-01T00:00:00.000Z" }), "switchYearlyAt");
  assert.equal(planChangeCopyKey({ kind: "interval_down", timing: "period_end", amountDueToday: 0, effectiveAt: "2026-11-01T00:00:00.000Z" }), "switchMonthlyAt");
  assert.equal(planChangeCopyKey({ kind: "upgrade", timing: "now" }), "payToday");
});
