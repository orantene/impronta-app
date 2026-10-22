import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";

import { confirmPlanChange, previewPlanChange, type PlanChangeRequest, type PlanChangeStripe } from "./plan-change";

type Call = { method: string; args: unknown[] };

function fakeSub(
  over: { plan?: string; interval?: "month" | "year"; schedule?: string | null; owner?: string; trialEnd?: number } = {},
): Stripe.Subscription {
  return {
    id: "sub_1",
    status: over.trialEnd ? "trialing" : "active",
    trial_end: over.trialEnd ?? null,
    customer: "cus_1",
    schedule: over.schedule ?? null,
    metadata: { plan_key: over.plan ?? "talent_pro", talent_profile_id: over.owner ?? "tp_1" },
    items: {
      data: [
        {
          id: "si_1",
          current_period_start: 1_000,
          current_period_end: 2_000_000_000,
          price: { id: "price_cur", currency: "usd", recurring: { interval: over.interval ?? "month" } },
        },
      ],
    },
  } as unknown as Stripe.Subscription;
}

function fakeStripe(sub: Stripe.Subscription, calls: Call[]): PlanChangeStripe {
  const rec = (method: string, ret: unknown) => async (...args: unknown[]) => {
    calls.push({ method, args });
    return ret;
  };
  return {
    subscriptions: {
      retrieve: rec("subscriptions.retrieve", sub),
      update: rec("subscriptions.update", sub),
    },
    invoices: { createPreview: rec("invoices.createPreview", { amount_due: 1234, currency: "usd" }) },
    prices: { retrieve: rec("prices.retrieve", { unit_amount: 900, currency: "usd" }) },
    subscriptionSchedules: {
      create: rec("schedules.create", { id: "sub_sched_new", phases: [{ start_date: 900 }] }),
      update: rec("schedules.update", { id: "sub_sched_new" }),
      release: rec("schedules.release", { id: "sub_sched_old" }),
      retrieve: rec("schedules.retrieve", { id: "sub_sched_old", current_phase: { start_date: 950 }, phases: [] }),
    },
  } as unknown as PlanChangeStripe;
}

const NOW = 1_800_000_000_000;
const req = (over: Partial<PlanChangeRequest> = {}): PlanChangeRequest => ({
  kind: "talent",
  subjectId: "tp_1",
  subscriptionId: "sub_1",
  toPlan: "talent_portfolio",
  toInterval: "month",
  toPriceId: "price_new",
  ...over,
});

function find(calls: Call[], method: string): Call {
  const c = calls.find((x) => x.method === method);
  assert.ok(c, `expected ${method}`);
  return c;
}

test("upgrade: preview amount, confirm charges with the SAME proration_date and a stable key", async () => {
  const calls: Call[] = [];
  const stripe = fakeStripe(fakeSub(), calls);
  const p = await previewPlanChange(stripe, req(), NOW);
  assert.ok(p.ok);
  assert.equal(p.kind, "upgrade");
  assert.equal(p.amountDueToday, 1234);
  assert.equal(p.currency, "usd");
  const previewArgs = find(calls, "invoices.createPreview").args[0] as { subscription_details: { proration_date: number } };
  assert.equal(previewArgs.subscription_details.proration_date, p.prorationDate);

  const c1 = await confirmPlanChange(stripe, req(), p.prorationDate, NOW + 30_000);
  const c2 = await confirmPlanChange(stripe, req(), p.prorationDate, NOW + 60_000);
  assert.ok(c1.ok && c2.ok);
  const updates = calls.filter((x) => x.method === "subscriptions.update");
  assert.equal(updates.length, 2);
  const [id, params, opts] = updates[0].args as [string, { proration_date: number; proration_behavior: string }, { idempotencyKey: string }];
  assert.equal(id, "sub_1");
  assert.equal(params.proration_date, p.prorationDate);
  assert.equal(params.proration_behavior, "always_invoice");
  assert.equal(opts.idempotencyKey, (updates[1].args[2] as { idempotencyKey: string }).idempotencyKey);
  assert.equal(calls.some((x) => x.method.startsWith("schedules.")), false);
});

test("downgrade: nothing charged today, schedule created then phased to period end", async () => {
  const calls: Call[] = [];
  const stripe = fakeStripe(fakeSub({ plan: "talent_portfolio" }), calls);
  const p = await previewPlanChange(stripe, req({ toPlan: "talent_pro" }), NOW);
  assert.ok(p.ok);
  assert.equal(p.timing, "period_end");
  assert.equal(p.amountDueToday, 0);
  assert.equal(p.effectiveAt, new Date(2_000_000_000 * 1000).toISOString());
  assert.equal(calls.some((x) => x.method === "invoices.createPreview"), false);

  const c = await confirmPlanChange(stripe, req({ toPlan: "talent_pro" }), p.prorationDate, NOW);
  assert.ok(c.ok);
  assert.equal(find(calls, "schedules.create").args[0] && (find(calls, "schedules.create").args[0] as { from_subscription: string }).from_subscription, "sub_1");
  const [schedId, params] = find(calls, "schedules.update").args as [string, { phases: { start_date: number; end_date?: number }[] }];
  assert.equal(schedId, "sub_sched_new");
  assert.equal(params.phases[0].start_date, 900);
  assert.equal(params.phases[0].end_date, 2_000_000_000);
  assert.equal(calls.some((x) => x.method === "subscriptions.update"), false);
});

test("yearly -> monthly on the same plan is a period-end interval_down", async () => {
  const calls: Call[] = [];
  const stripe = fakeStripe(fakeSub({ interval: "year" }), calls);
  const p = await previewPlanChange(stripe, req({ toPlan: "talent_pro", toInterval: "month" }), NOW);
  assert.ok(p.ok);
  assert.equal(p.kind, "interval_down");
  assert.equal(p.timing, "period_end");
});

test("upgrading again cancels the pending downgrade schedule before charging", async () => {
  const calls: Call[] = [];
  const stripe = fakeStripe(fakeSub({ schedule: "sub_sched_old" }), calls);
  const p = await previewPlanChange(stripe, req(), NOW);
  assert.ok(p.ok);
  assert.equal(p.cancelsPendingChange, true);
  const c = await confirmPlanChange(stripe, req(), p.prorationDate, NOW);
  assert.ok(c.ok);
  const order = calls.map((x) => x.method).filter((m) => m === "schedules.release" || m === "subscriptions.update");
  assert.deepEqual(order, ["schedules.release", "subscriptions.update"]);
});

test("choosing the current plan with a pending downgrade only releases the schedule", async () => {
  const calls: Call[] = [];
  const stripe = fakeStripe(fakeSub({ schedule: "sub_sched_old" }), calls);
  const c = await confirmPlanChange(stripe, req({ toPlan: "talent_pro" }), Math.floor(NOW / 1000), NOW);
  assert.ok(c.ok);
  assert.equal(c.kind, "noop");
  assert.equal(calls.filter((x) => x.method === "schedules.release").length, 1);
  assert.equal(calls.some((x) => x.method === "subscriptions.update"), false);
});

test("a second downgrade reuses the pending schedule", async () => {
  const calls: Call[] = [];
  const stripe = fakeStripe(fakeSub({ plan: "talent_portfolio", schedule: "sub_sched_old" }), calls);
  const c = await confirmPlanChange(stripe, req({ toPlan: "talent_pro" }), Math.floor(NOW / 1000), NOW);
  assert.ok(c.ok);
  assert.equal(calls.some((x) => x.method === "schedules.create"), false);
  const [schedId, params] = find(calls, "schedules.update").args as [string, { phases: { start_date: number }[] }];
  assert.equal(schedId, "sub_sched_old");
  assert.equal(params.phases[0].start_date, 950);
});

test("stale proration date is refused before any Stripe call", async () => {
  const calls: Call[] = [];
  const stripe = fakeStripe(fakeSub(), calls);
  const c = await confirmPlanChange(stripe, req(), Math.floor(NOW / 1000) - 3600, NOW);
  assert.equal(c.ok, false);
  assert.equal(!c.ok && c.code, "stale_preview");
  assert.equal(calls.length, 0);
});

test("someone else's subscription and a missing price are refused", async () => {
  const calls: Call[] = [];
  const other = fakeStripe(fakeSub({ owner: "tp_other" }), calls);
  const p = await previewPlanChange(other, req(), NOW);
  assert.equal(!p.ok && p.code, "not_allowed");
  const noPrice = await previewPlanChange(other, req({ toPriceId: null }), NOW);
  assert.equal(!noPrice.ok && noPrice.code, "no_price");
});

test("downgrade while trialing keeps the trial on the current phase (nothing billed today)", async () => {
  const calls: Call[] = [];
  const stripe = fakeStripe(fakeSub({ plan: "talent_portfolio", trialEnd: 2_000_000_000 }), calls);
  const p = await previewPlanChange(stripe, req({ toPlan: "talent_pro" }), NOW);
  assert.ok(p.ok);
  assert.equal(p.amountDueToday, 0);
  const c = await confirmPlanChange(stripe, req({ toPlan: "talent_pro" }), p.prorationDate, NOW);
  assert.ok(c.ok);
  const [, params] = find(calls, "schedules.update").args as [string, { phases: { trial_end?: number }[] }];
  assert.equal(params.phases[0].trial_end, 2_000_000_000);
  assert.equal(params.phases[1].trial_end, undefined);
});

test("downgrade on an active (not trialing) plan sets no trial_end", async () => {
  const calls: Call[] = [];
  const stripe = fakeStripe(fakeSub({ plan: "talent_portfolio" }), calls);
  const p = await previewPlanChange(stripe, req({ toPlan: "talent_pro" }), NOW);
  assert.ok(p.ok);
  await confirmPlanChange(stripe, req({ toPlan: "talent_pro" }), p.prorationDate, NOW);
  const [, params] = find(calls, "schedules.update").args as [string, { phases: { trial_end?: number }[] }];
  assert.equal("trial_end" in params.phases[0], false);
});

test("a Stripe failure while pricing or confirming is logged with the step, not swallowed", async () => {
  const boom = new Error("stripe down");
  const stripe = {
    subscriptions: {
      retrieve: async () => {
        throw boom;
      },
      update: async () => fakeSub(),
    },
  } as unknown as PlanChangeStripe;
  const logged: Array<{ context: string; err: unknown }> = [];
  const req: PlanChangeRequest = {
    kind: "workspace",
    subjectId: "t_1",
    subscriptionId: "sub_1",
    toPlan: "studio",
    toInterval: "month",
    toPriceId: "price_studio",
    onError: (context, err) => logged.push({ context, err }),
  };
  const preview = await previewPlanChange(stripe, req);
  assert.equal(preview.ok, false);
  const confirmed = await confirmPlanChange(stripe, req, Math.floor(Date.now() / 1000));
  assert.equal(confirmed.ok, false);
  assert.equal(logged.length, 2);
  assert.match(logged[0].context, /preview\.stripe .*toPlan=studio/);
  assert.match(logged[1].context, /confirm\.stripe .*toPlan=studio/);
  assert.equal(logged[0].err, boom);
});

// ─── B6 / TUL-1874: the customer's language is set BEFORE the proration invoice exists ────────────────────────

test("B6: an immediate change writes preferred_locales first, then updates the subscription", async () => {
  const calls: Call[] = [];
  const stripe = fakeStripe(fakeSub(), calls);
  stripe.customers = {
    update: (async (...args: unknown[]) => {
      calls.push({ method: "customers.update", args });
      return {};
    }) as never,
  };
  const p = await previewPlanChange(stripe, req(), NOW);
  assert.ok(p.ok);
  const c = await confirmPlanChange(stripe, req({ locale: "es" }), p.prorationDate, NOW + 30_000);
  assert.ok(c.ok);
  const order = calls.map((x) => x.method).filter((m) => m === "customers.update" || m === "subscriptions.update");
  assert.deepEqual(order, ["customers.update", "subscriptions.update"]);
  assert.deepEqual(find(calls, "customers.update").args, ["cus_1", { preferred_locales: ["es"] }]);
});

test("B6: a failing locale write never blocks the plan change", async () => {
  const calls: Call[] = [];
  const stripe = fakeStripe(fakeSub(), calls);
  stripe.customers = { update: (async () => { throw new Error("boom"); }) as never };
  const p = await previewPlanChange(stripe, req(), NOW);
  assert.ok(p.ok);
  const c = await confirmPlanChange(stripe, req({ locale: "en" }), p.prorationDate, NOW + 30_000);
  assert.ok(c.ok);
});
