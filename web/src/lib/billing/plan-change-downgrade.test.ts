/**
 * TUL-831 · "there's no downgrade option": switch to a lower plan or to Free. Takes effect at the END of the paid period,
 * nothing is charged or refunded today, one Stripe write, never a checkout or a second subscription.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";

import { confirmPlanChange, previewPlanChange, type PlanChangeRequest, type PlanChangeStripe } from "./plan-change";
import { cancelPendingPlanChange, loadPendingPlanChange, pendingChangeOf } from "./plan-change-pending";
import { planChangeCopyKey, planChangePolicy } from "./plan-change-policy";

type Call = { method: string; args: unknown[] };

const PERIOD_END = 2_000_000_000;
const NOW = 1_800_000_000_000;

function fakeSub(
  over: { plan?: string; schedule?: string | null; cancelAtPeriodEnd?: boolean; cancelAt?: number | null; status?: string } = {},
): Stripe.Subscription {
  return {
    id: "sub_1",
    status: over.status ?? "active",
    trial_end: null,
    customer: "cus_1",
    schedule: over.schedule ?? null,
    cancel_at_period_end: over.cancelAtPeriodEnd ?? false,
    cancel_at: over.cancelAt ?? null,
    metadata: { plan_key: over.plan ?? "talent_portfolio", talent_profile_id: "tp_1" },
    items: {
      data: [
        {
          id: "si_1",
          current_period_start: 1_000,
          current_period_end: PERIOD_END,
          price: { id: "price_cur", currency: "usd", recurring: { interval: "month" } },
        },
      ],
    },
  } as unknown as Stripe.Subscription;
}

function fakeStripe(sub: Stripe.Subscription, calls: Call[], price: { unit_amount: number | null; currency: string } = { unit_amount: 900, currency: "usd" }): PlanChangeStripe {
  const rec = (method: string, ret: unknown) => async (...args: unknown[]) => {
    calls.push({ method, args });
    return ret;
  };
  return {
    subscriptions: { retrieve: rec("subscriptions.retrieve", sub), update: rec("subscriptions.update", sub) },
    invoices: { createPreview: rec("invoices.createPreview", { amount_due: 777, currency: "usd" }) },
    prices: { retrieve: rec("prices.retrieve", price) },
    subscriptionSchedules: {
      create: rec("schedules.create", { id: "sub_sched_new", phases: [{ start_date: 900 }] }),
      update: rec("schedules.update", { id: "sub_sched_new" }),
      release: rec("schedules.release", { id: "sub_sched_old" }),
      retrieve: rec("schedules.retrieve", { id: "sub_sched_old", current_phase: { start_date: 950 }, phases: [] }),
    },
  } as unknown as PlanChangeStripe;
}

const toFree = (over: Partial<PlanChangeRequest> = {}): PlanChangeRequest => ({
  kind: "talent",
  subjectId: "tp_1",
  subscriptionId: "sub_1",
  toPlan: "talent_basic",
  toInterval: "month",
  toPriceId: null,
  ...over,
});

const methods = (calls: Call[]) => calls.map((c) => c.method);

// ─── Policy ──────────────────────────────────────────────────────────────────

test("policy: paid -> Free and paid -> lower paid are downgrades at period end", () => {
  for (const [from, to] of [
    ["talent_portfolio", "talent_basic"],
    ["talent_pro", "talent_basic"],
    ["talent_portfolio", "talent_pro"],
  ] as const) {
    const p = planChangePolicy({ plan: from, interval: "month" }, { plan: to, interval: "month" });
    assert.equal(p.kind, "downgrade", `${from} -> ${to}`);
    assert.equal(p.timing, "period_end");
    assert.equal(p.stripeParams.proration_behavior, "none");
  }
});

test("policy: the confirm sentence names the plan, the date and that nothing is charged today", () => {
  assert.equal(planChangeCopyKey({ kind: "downgrade", timing: "period_end" }), "downgradeAt");
});

// ─── Preview ─────────────────────────────────────────────────────────────────

test("preview to Free: effective date is the period end, nothing due today, no price needed, no invoice preview", async () => {
  const calls: Call[] = [];
  const p = await previewPlanChange(fakeStripe(fakeSub(), calls), toFree(), NOW);
  assert.ok(p.ok);
  assert.equal(p.kind, "downgrade");
  assert.equal(p.timing, "period_end");
  assert.equal(p.amountDueToday, 0);
  assert.equal(p.breakdown, undefined);
  assert.equal(p.effectiveAt, new Date(PERIOD_END * 1000).toISOString());
  assert.equal(p.fromPlan, "talent_portfolio");
  assert.equal(methods(calls).includes("invoices.createPreview"), false);
  assert.equal(methods(calls).includes("prices.retrieve"), false);
});

test("preview to Free when the plan is already set to end reports a noop instead of a second change", async () => {
  const p = await previewPlanChange(fakeStripe(fakeSub({ cancelAtPeriodEnd: true }), []), toFree(), NOW);
  assert.ok(p.ok);
  assert.equal(p.kind, "noop");
  assert.equal(p.amountDueToday, 0);
});

test("TUL-1914: Free already scheduled names the end date, is flagged, and reads as 'already scheduled' not 'already on this plan'", async () => {
  const p = await previewPlanChange(fakeStripe(fakeSub({ cancelAtPeriodEnd: true }), []), toFree(), NOW);
  assert.ok(p.ok);
  assert.equal(p.alreadyScheduled, true);
  assert.equal(p.effectiveAt, new Date(PERIOD_END * 1000).toISOString());
  assert.equal(planChangeCopyKey(p), "alreadyScheduled");
  // A portal-style cancel (cancel_at only) uses cancel_at as the date.
  const portal = await previewPlanChange(fakeStripe(fakeSub({ cancelAt: PERIOD_END + 3600 }), []), toFree(), NOW);
  assert.ok(portal.ok);
  assert.equal(portal.effectiveAt, new Date((PERIOD_END + 3600) * 1000).toISOString());
  // Not scheduled yet: no flag, the plain change.
  const fresh = await previewPlanChange(fakeStripe(fakeSub(), []), toFree(), NOW);
  assert.ok(fresh.ok);
  assert.notEqual(fresh.alreadyScheduled, true);
});

test("TUL-1914: confirming Free again changes nothing at Stripe", async () => {
  const calls: Call[] = [];
  const out = await confirmPlanChange(fakeStripe(fakeSub({ cancelAtPeriodEnd: true }), calls), toFree(), Math.floor(NOW / 1000), NOW);
  assert.ok(out.ok);
  assert.equal(methods(calls).some((m) => m === "subscriptions.update" || m.startsWith("schedules.")), false);
});

test("preview to a lower PAID plan fails closed when its price cannot be read", async () => {
  const calls: Call[] = [];
  const stripe = fakeStripe(fakeSub(), calls, { unit_amount: null, currency: "usd" });
  const p = await previewPlanChange(stripe, toFree({ toPlan: "talent_pro", toPriceId: "price_pro" }), NOW);
  assert.equal(p.ok, false);
  assert.equal(!p.ok && p.code, "no_price");
  const none = await previewPlanChange(fakeStripe(fakeSub(), []), toFree({ toPlan: "talent_pro", toPriceId: null }), NOW);
  assert.equal(none.ok === false && none.code, "no_price");
});

test("preview to a lower PAID plan shows the new price and still charges nothing today", async () => {
  const p = await previewPlanChange(fakeStripe(fakeSub(), []), toFree({ toPlan: "talent_pro", toPriceId: "price_pro" }), NOW);
  assert.ok(p.ok);
  assert.equal(p.amountDueToday, 0);
  assert.deepEqual(p.newPrice, { amount: 900, currency: "usd" });
});

test("Free is a talent-only target", async () => {
  const p = await previewPlanChange(fakeStripe(fakeSub(), []), toFree({ kind: "workspace" }), NOW);
  assert.equal(p.ok, false);
  assert.equal(!p.ok && p.code, "not_allowed");
});

// ─── Confirm ─────────────────────────────────────────────────────────────────

test("confirm to Free: exactly one subscriptions.update with cancel_at_period_end, no checkout, no second subscription, no proration", async () => {
  const calls: Call[] = [];
  const stripe = fakeStripe(fakeSub(), calls);
  const p = await previewPlanChange(stripe, toFree(), NOW);
  assert.ok(p.ok);
  const out = await confirmPlanChange(stripe, toFree(), p.prorationDate, NOW);
  assert.deepEqual(out, { ok: true, kind: "downgrade", timing: "period_end", effectiveAt: new Date(PERIOD_END * 1000).toISOString() });

  const writes = calls.filter((c) => !c.method.endsWith(".retrieve"));
  assert.deepEqual(methods(writes), ["subscriptions.update"]);
  const [id, params, opts] = writes[0].args as [string, Record<string, unknown>, { idempotencyKey: string }];
  assert.equal(id, "sub_1");
  assert.deepEqual(params, { cancel_at_period_end: true });
  assert.match(opts.idempotencyKey, /^plan_change_downgrade_free_sub_1_talent_basic_/);
});

test("confirm to Free replays the same idempotency key for a double click", async () => {
  const calls: Call[] = [];
  const stripe = fakeStripe(fakeSub(), calls);
  const p = await previewPlanChange(stripe, toFree(), NOW);
  assert.ok(p.ok);
  await confirmPlanChange(stripe, toFree(), p.prorationDate, NOW);
  await confirmPlanChange(stripe, toFree(), p.prorationDate, NOW + 1000);
  const keys = calls.filter((c) => c.method === "subscriptions.update").map((c) => (c.args[2] as { idempotencyKey: string }).idempotencyKey);
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
});

test("confirm to Free with a pending paid-plan schedule releases the schedule first (Stripe refuses the flag on a scheduled sub)", async () => {
  const calls: Call[] = [];
  const stripe = fakeStripe(fakeSub({ schedule: "sub_sched_old" }), calls);
  const out = await confirmPlanChange(stripe, toFree(), Math.floor(NOW / 1000), NOW);
  assert.ok(out.ok);
  const writes = methods(calls.filter((c) => !c.method.endsWith(".retrieve")));
  assert.deepEqual(writes, ["schedules.release", "subscriptions.update"]);
});

test("confirm to Free on a plan already ending does nothing", async () => {
  const calls: Call[] = [];
  const out = await confirmPlanChange(fakeStripe(fakeSub({ cancelAtPeriodEnd: true }), calls), toFree(), Math.floor(NOW / 1000), NOW);
  assert.deepEqual(out, { ok: true, kind: "noop", timing: "now", effectiveAt: null });
  assert.equal(methods(calls).includes("subscriptions.update"), false);
});

test("confirm to Free refuses a stale preview before any Stripe call", async () => {
  const calls: Call[] = [];
  const out = await confirmPlanChange(fakeStripe(fakeSub(), calls), toFree(), 1, NOW);
  assert.equal(out.ok, false);
  assert.equal(!out.ok && out.code, "stale_preview");
  assert.equal(calls.length, 0);
});

test("confirm to Free is refused for a subscription that is not active", async () => {
  const out = await confirmPlanChange(fakeStripe(fakeSub({ status: "canceled" }), []), toFree(), Math.floor(NOW / 1000), NOW);
  assert.equal(out.ok, false);
});

// ─── Cancel the scheduled change ─────────────────────────────────────────────

const pend = { kind: "talent" as const, subjectId: "tp_1", subscriptionId: "sub_1" };

test("cancel change: a scheduled lower plan is undone by releasing the schedule, one write", async () => {
  const calls: Call[] = [];
  const out = await cancelPendingPlanChange(fakeStripe(fakeSub({ schedule: "sub_sched_old" }), calls), pend, NOW);
  assert.deepEqual(out, { ok: true, hadPending: true });
  assert.deepEqual(methods(calls.filter((c) => !c.method.endsWith(".retrieve"))), ["schedules.release"]);
});

test("cancel change: a pending switch to Free is undone by clearing cancel_at_period_end, one write", async () => {
  const calls: Call[] = [];
  const out = await cancelPendingPlanChange(fakeStripe(fakeSub({ cancelAtPeriodEnd: true }), calls), pend, NOW);
  assert.deepEqual(out, { ok: true, hadPending: true });
  const writes = calls.filter((c) => !c.method.endsWith(".retrieve"));
  assert.deepEqual(methods(writes), ["subscriptions.update"]);
  assert.deepEqual(writes[0].args[1], { cancel_at_period_end: false });
});

test("cancel change: a portal-style cancel_at is cleared with an empty string, never both fields", async () => {
  const calls: Call[] = [];
  await cancelPendingPlanChange(fakeStripe(fakeSub({ cancelAt: PERIOD_END }), calls), pend, NOW);
  const update = calls.find((c) => c.method === "subscriptions.update");
  assert.deepEqual(update?.args[1], { cancel_at: "" });
});

test("cancel change: nothing pending writes nothing", async () => {
  const calls: Call[] = [];
  const out = await cancelPendingPlanChange(fakeStripe(fakeSub(), calls), pend, NOW);
  assert.deepEqual(out, { ok: true, hadPending: false });
  assert.deepEqual(methods(calls), ["subscriptions.retrieve"]);
});

test("cancel change: someone else's subscription is refused", async () => {
  const out = await cancelPendingPlanChange(fakeStripe(fakeSub(), []), { ...pend, subjectId: "tp_other" }, NOW);
  assert.equal(out.ok, false);
});

// ─── The Plan page reads the pending change ──────────────────────────────────

test("pending change: Free at period end, or the next schedule phase, or nothing", () => {
  assert.deepEqual(pendingChangeOf(fakeSub({ cancelAtPeriodEnd: true }), null, NOW), {
    toPlan: "talent_basic",
    effectiveAt: new Date(PERIOD_END * 1000).toISOString(),
  });
  const schedule = {
    phases: [
      { start_date: 900, end_date: PERIOD_END, metadata: null },
      { start_date: PERIOD_END, metadata: { plan_key: "talent_pro" } },
    ],
  } as unknown as Stripe.SubscriptionSchedule;
  assert.deepEqual(pendingChangeOf(fakeSub({ schedule: "sub_sched_old" }), schedule, NOW), {
    toPlan: "talent_pro",
    effectiveAt: new Date(PERIOD_END * 1000).toISOString(),
  });
  assert.equal(pendingChangeOf(fakeSub(), null, NOW), null);
  // A phase that already started is not pending any more.
  assert.equal(pendingChangeOf(fakeSub({ schedule: "s" }), schedule, (PERIOD_END + 10) * 1000), null);
});

test("pending change loads with the schedule expanded and refuses another subject's subscription", async () => {
  const calls: Call[] = [];
  const ok = await loadPendingPlanChange(fakeStripe(fakeSub({ cancelAtPeriodEnd: true }), calls), pend, NOW);
  assert.ok(ok.ok && ok.pending?.toPlan === "talent_basic");
  assert.deepEqual((calls[0].args[1] as { expand: string[] }).expand, ["items.data.price", "schedule"]);
  const other = await loadPendingPlanChange(fakeStripe(fakeSub(), []), { ...pend, subjectId: "tp_other" }, NOW);
  assert.equal(other.ok, false);
});
