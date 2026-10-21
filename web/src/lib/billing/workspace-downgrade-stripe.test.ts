/** TUL-1518: a workspace downgrade tells Stripe FIRST, fails closed, and never upgrades through this door. Fake Stripe, no network. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import type Stripe from "stripe";

import type { PlanChangeStripe } from "./plan-change";
import { applyWorkspaceDowngradeAtStripe, downgradeProrationDate, type WorkspaceDowngradeDeps } from "./workspace-downgrade-stripe";

type Call = { method: string; args: unknown[] };
const PERIOD_END = 2_000_000_000;

function sub(over: { plan?: string; interval?: "month" | "year"; status?: string; schedule?: string | null } = {}): Stripe.Subscription {
  return {
    id: "sub_1",
    status: over.status ?? "active",
    trial_end: null,
    customer: "cus_1",
    schedule: over.schedule ?? null,
    metadata: { plan_key: over.plan ?? "agency", tenant_id: "t1" },
    items: { data: [{ id: "si_1", current_period_start: 1_000, current_period_end: PERIOD_END, price: { id: "price_cur", currency: "usd", recurring: { interval: over.interval ?? "month" } } }] },
  } as unknown as Stripe.Subscription;
}

function world(over: Parameters<typeof sub>[0] = {}, opts: { failOn?: string } = {}) {
  const calls: Call[] = [];
  const rec = (method: string, ret: unknown) => async (...args: unknown[]) => {
    calls.push({ method, args });
    if (opts.failOn === method) throw new Error("stripe refused");
    return ret;
  };
  const stripe = {
    subscriptions: { retrieve: rec("subscriptions.retrieve", sub(over)), update: rec("subscriptions.update", sub(over)) },
    invoices: { createPreview: rec("invoices.createPreview", {}) },
    subscriptionSchedules: {
      create: rec("schedules.create", { id: "sub_sched_new", phases: [{ start_date: 900 }] }),
      update: rec("schedules.update", { id: "sub_sched_new" }),
      release: rec("schedules.release", { id: "sub_sched_old" }),
      retrieve: rec("schedules.retrieve", { id: "sub_sched_old", current_phase: { start_date: 950 }, phases: [] }),
    },
  } as unknown as PlanChangeStripe;
  let cancelled = 0;
  const deps: WorkspaceDowngradeDeps = {
    readSubscriptionId: async () => "sub_1",
    recordPending: async () => ({ ok: true }),
    stripe: () => stripe as ReturnType<WorkspaceDowngradeDeps["stripe"]>,
    resolvePriceId: async (plan) => `price_${plan}`,
    cancelAtPeriodEnd: async () => { cancelled += 1; return { ok: true, effectiveAt: "2033-05-18T03:33:20.000Z" }; },
    now: () => 1_700_000_000_000,
  };
  return { calls, deps, cancelled: () => cancelled };
}
const writes = (calls: Call[]) => calls.filter((c) => /subscriptions\.update|schedules\.(create|update|release)/.test(c.method)).map((c) => c.method);

describe("no subscription", () => {
  test("a free or comped workspace has nothing at Stripe: the caller's local write is right", async () => {
    const w = world();
    const r = await applyWorkspaceDowngradeAtStripe("t1", "studio", { ...w.deps, readSubscriptionId: async () => null });
    assert.deepEqual(r, { ok: true, hadSubscription: false });
    assert.deepEqual(w.calls, []);
  });
  test("a subscription that already ended at Stripe is not downgraded there", async () => {
    const w = world({ status: "canceled" });
    assert.deepEqual(await applyWorkspaceDowngradeAtStripe("t1", "studio", w.deps), { ok: true, hadSubscription: false });
    assert.deepEqual(writes(w.calls), []);
  });
});

describe("a lower paid plan", () => {
  test("agency -> studio is scheduled for the END of the period (new price from the next invoice), never charged now", async () => {
    const w = world({ plan: "agency" });
    const r = await applyWorkspaceDowngradeAtStripe("t1", "studio", w.deps);
    assert.equal(r.ok, true);
    assert.ok(r.ok && r.hadSubscription && r.mode === "schedule");
    assert.equal(r.ok && r.hadSubscription && r.effectiveAt, new Date(PERIOD_END * 1000).toISOString());
    assert.deepEqual(writes(w.calls), ["schedules.create", "schedules.update"]);
    const upd = w.calls.find((c) => c.method === "schedules.update")!;
    const params = upd.args[1] as { proration_behavior: string; phases: Array<{ items: Array<{ price: string }> }> };
    assert.equal(params.proration_behavior, "none");
    assert.deepEqual(params.phases.map((p) => p.items[0].price), ["price_cur", "price_studio"]);
  });
  test("an existing schedule is reused, not duplicated", async () => {
    const w = world({ plan: "agency", schedule: "sub_sched_old" });
    assert.equal((await applyWorkspaceDowngradeAtStripe("t1", "studio", w.deps)).ok, true);
    assert.ok(!writes(w.calls).includes("schedules.create"));
    assert.ok(writes(w.calls).includes("schedules.update"));
  });
  test("IDEMPOTENT: a retry or double click inside the window sends the SAME idempotency keys", async () => {
    const a = world({ plan: "agency" });
    const b = world({ plan: "agency" });
    await applyWorkspaceDowngradeAtStripe("t1", "studio", { ...a.deps, now: () => 1_700_000_100_000 });
    await applyWorkspaceDowngradeAtStripe("t1", "studio", { ...b.deps, now: () => 1_700_000_500_000 });
    const keys = (calls: Call[]) => calls.filter((c) => c.method.startsWith("schedules.") && c.method !== "schedules.retrieve").map((c) => (c.args[c.args.length - 1] as { idempotencyKey: string }).idempotencyKey);
    assert.deepEqual(keys(a.calls), keys(b.calls));
    assert.ok(keys(a.calls).every((k) => k.includes("sub_1") && k.includes("studio")));
    assert.equal(downgradeProrationDate(1_700_000_100_000), downgradeProrationDate(1_700_000_500_000));
  });
  test("the billing interval is kept (a yearly plan stays yearly)", async () => {
    const w = world({ plan: "agency", interval: "year" });
    await applyWorkspaceDowngradeAtStripe("t1", "studio", { ...w.deps, resolvePriceId: async (plan, interval) => `price_${plan}_${interval}` });
    const upd = w.calls.find((c) => c.method === "schedules.update")!;
    const params = upd.args[1] as { phases: Array<{ items: Array<{ price: string }> }> };
    assert.equal(params.phases[1].items[0].price, "price_studio_year");
  });
});

describe("to free", () => {
  test("cancels at the end of the period through the existing cancel flow; no schedule", async () => {
    const w = world({ plan: "studio" });
    const r = await applyWorkspaceDowngradeAtStripe("t1", "free", w.deps);
    assert.deepEqual(r, { ok: true, hadSubscription: true, mode: "cancel_at_period_end", effectiveAt: "2033-05-18T03:33:20.000Z" });
    assert.equal(w.cancelled(), 1);
    assert.deepEqual(writes(w.calls), []);
  });
  test("a cancel Stripe refuses fails the downgrade", async () => {
    const w = world({ plan: "studio" });
    const r = await applyWorkspaceDowngradeAtStripe("t1", "free", { ...w.deps, cancelAtPeriodEnd: async () => ({ ok: false, error: "Stripe could not cancel the subscription. Nothing was changed." }) });
    assert.equal(r.ok, false);
  });
});

describe("fails closed", () => {
  test("Stripe refusing the schedule fails the whole downgrade", async () => {
    const w = world({ plan: "agency" }, { failOn: "schedules.create" });
    const r = await applyWorkspaceDowngradeAtStripe("t1", "studio", w.deps);
    assert.equal(r.ok, false);
  });
  test("an unreadable subscription row is NOT 'no subscription'", async () => {
    const w = world();
    const r = await applyWorkspaceDowngradeAtStripe("t1", "studio", { ...w.deps, readSubscriptionId: async () => { throw new Error("db down"); } });
    assert.equal(r.ok, false);
    assert.deepEqual(w.calls, []);
  });
  test("no Stripe client, no price in the catalog, or Stripe down on read: refuses", async () => {
    const w = world();
    assert.equal((await applyWorkspaceDowngradeAtStripe("t1", "studio", { ...w.deps, stripe: () => null })).ok, false);
    assert.equal((await applyWorkspaceDowngradeAtStripe("t1", "studio", { ...w.deps, resolvePriceId: async () => null })).ok, false);
    const down = world({}, { failOn: "subscriptions.retrieve" });
    assert.equal((await applyWorkspaceDowngradeAtStripe("t1", "studio", down.deps)).ok, false);
  });
  test("never an upgrade through this door: a higher or equal target than what Stripe bills is refused with no writes", async () => {
    for (const target of ["network", "agency"] as const) {
      const w = world({ plan: "agency" });
      const r = await applyWorkspaceDowngradeAtStripe("t1", target, w.deps);
      assert.equal(r.ok, false, target);
      assert.deepEqual(writes(w.calls), [], target);
    }
  });
});

describe("commitPlanDowngrade wiring", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/server-actions/admin-plan-downgrade.ts"), "utf8");
  test("Stripe is told BEFORE the roster is archived or the tier written, and a refusal returns", () => {
    const call = src.indexOf("applyWorkspaceDowngrade(tenantId, v.target_tier,");
    assert.ok(call > 0);
    assert.match(src.slice(call, call + 400), /if \(!stripeStep\.ok\) return \{ ok: false, error: stripeStep\.error \};/);
    assert.ok(call < src.indexOf("archiveRosterOverflow(supabase"), "before the archive");
    assert.ok(call < src.indexOf('.update({ plan_tier: v.target_tier'), "before the plan write");
  });
  test("with a live subscription the tier is NOT written locally (the webhook is the single writer)", () => {
    assert.match(src, /if \(!stripeStep\.hadSubscription\) \{\s+const \{ error: planErr \} = await admin/);
  });
});
