/** TUL-1624: every workspace is capped, not just the hub; the per-minute limit is shared and fails closed. Lane: test:ai-guardrails. */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { assertAiInvocationAllowed, type AiUsageGateDeps } from "./ai-usage-gate";
import { DEFAULT_AI_CONTROLS_BY_PLAN, resolveDefaultAiControls } from "./default-tenant-controls";
import { AI_RPM_STORE_ERROR, _resetAiRpmForTests, checkAiRpm } from "../rate-limit-kv-ai-rpm";
import { WORKSPACE_PLAN_TIERS } from "../platform/plan-override";

const ROW = { tenant_id: "t", credential_mode: "platform", warn_threshold_percent: null, provider_unavailable_behavior: "graceful" } as const;

function deps(over: Partial<AiUsageGateDeps> & { row?: Record<string, unknown> | null; plan?: string | null; usage?: { spendCents: number; requestCount: number } | null; rpmOk?: boolean } = {}) {
  const calls: string[] = [];
  const d: AiUsageGateDeps = {
    isMasterEnabled: async () => true,
    readControls: async () => { calls.push("controls"); return { row: (over.row === undefined ? null : over.row) as never, error: false }; },
    readPlanTier: async () => { calls.push("plan"); return over.plan === undefined ? "free" : over.plan; },
    readUsage: async () => { calls.push("usage"); return over.usage === undefined ? { spendCents: 0, requestCount: 0 } : over.usage; },
    checkRpm: async (_t, rpm) => { calls.push(`rpm:${rpm}`); return over.rpmOk === false ? AI_RPM_STORE_ERROR : { ok: true }; },
    ...over,
  };
  return { d, calls };
}

describe("a workspace with NO controls row is capped by its plan", () => {
  test("free: spend at the default cap is refused (the bug: it used to be uncapped)", async () => {
    const cap = DEFAULT_AI_CONTROLS_BY_PLAN.free.monthlySpendCapCents;
    const under = await assertAiInvocationAllowed("w1", deps({ plan: "free", usage: { spendCents: cap - 1, requestCount: 0 } }).d);
    assert.equal(under.ok, true);
    const over = await assertAiInvocationAllowed("w1", deps({ plan: "free", usage: { spendCents: cap, requestCount: 0 } }).d);
    assert.equal(over.ok, false);
    assert.equal(!over.ok && over.code, "spend_cap");
  });
  test("the monthly request ceiling applies too", async () => {
    const r = await assertAiInvocationAllowed("w1", deps({ plan: "studio", usage: { spendCents: 0, requestCount: DEFAULT_AI_CONTROLS_BY_PLAN.studio.maxRequestsPerMonth } }).d);
    assert.equal(!r.ok && r.code, "monthly_requests");
  });
  test("each plan gets its own ceiling and the per-minute number is passed to the shared limiter", async () => {
    for (const plan of WORKSPACE_PLAN_TIERS) {
      const x = deps({ plan });
      await assertAiInvocationAllowed("w1", x.d);
      assert.ok(x.calls.includes(`rpm:${DEFAULT_AI_CONTROLS_BY_PLAN[plan].maxRequestsPerMinute}`), plan);
    }
  });
  test("ceilings grow with the plan, and an unknown or missing plan is the strictest one", () => {
    const caps = WORKSPACE_PLAN_TIERS.map((p) => DEFAULT_AI_CONTROLS_BY_PLAN[p].monthlySpendCapCents);
    assert.deepEqual([...caps].sort((a, b) => a - b), caps, "free < website < studio < agency < network");
    assert.deepEqual(resolveDefaultAiControls("enterprise-9"), DEFAULT_AI_CONTROLS_BY_PLAN.free);
    assert.deepEqual(resolveDefaultAiControls(null), DEFAULT_AI_CONTROLS_BY_PLAN.free);
  });
  test("a plan we cannot read is capped as free, not waved through", async () => {
    const r = await assertAiInvocationAllowed("w1", deps({ plan: null, usage: { spendCents: DEFAULT_AI_CONTROLS_BY_PLAN.free.monthlySpendCapCents, requestCount: 0 } }).d);
    assert.equal(!r.ok && r.code, "spend_cap");
  });
});

describe("a row still wins (per-workspace override)", () => {
  test("the row's cap, hard stop, rpm and monthly requests are used; the plan is not even read", async () => {
    const x = deps({ row: { ...ROW, monthly_spend_cap_cents: 50_000, hard_stop_on_cap: true, max_requests_per_minute: 7, max_requests_per_month: 9_999 }, usage: { spendCents: 49_999, requestCount: 0 } });
    assert.equal((await assertAiInvocationAllowed("w1", x.d)).ok, true);
    assert.ok(x.calls.includes("rpm:7") && !x.calls.includes("plan"));
    const stop = await assertAiInvocationAllowed("w1", deps({ row: { ...ROW, monthly_spend_cap_cents: 100, hard_stop_on_cap: true, max_requests_per_minute: null, max_requests_per_month: null }, usage: { spendCents: 100, requestCount: 0 } }).d);
    assert.equal(!stop.ok && stop.code, "spend_cap");
  });
  test("a row without hard stop does not block on spend (unchanged behaviour)", async () => {
    const r = await assertAiInvocationAllowed("w1", deps({ row: { ...ROW, monthly_spend_cap_cents: 100, hard_stop_on_cap: false, max_requests_per_minute: null, max_requests_per_month: null }, usage: { spendCents: 9_999, requestCount: 0 } }).d);
    assert.equal(r.ok, true);
  });
});

describe("the AI master switch (TUL-1622) comes first", () => {
  test("off: refused with ai_off before anything is read", async () => {
    const x = deps();
    const r = await assertAiInvocationAllowed("w1", { ...x.d, isMasterEnabled: async () => false });
    assert.equal(!r.ok && r.code, "ai_off");
    assert.deepEqual(x.calls, []);
  });
});

describe("fails closed", () => {
  test("a controls read error refuses instead of looking like 'no row'", async () => {
    const r = await assertAiInvocationAllowed("w1", { ...deps().d, readControls: async () => ({ row: null, error: true }) });
    assert.equal(!r.ok && r.code, "unavailable");
  });
  test("a usage read error refuses (the old gate treated it as zero spend)", async () => {
    const r = await assertAiInvocationAllowed("w1", deps({ usage: null }).d);
    assert.equal(!r.ok && r.code, "unavailable");
  });
  test("the shared per-minute limiter refusing (or erroring) refuses the call", async () => {
    const r = await assertAiInvocationAllowed("w1", deps({ rpmOk: false }).d);
    assert.equal(!r.ok && r.code, "rate_limit");
  });
});

describe("the shared per-minute limiter", () => {
  const saved = { ...process.env };
  beforeEach(() => { delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN; delete process.env.VERCEL_ENV; _resetAiRpmForTests(null); });
  afterEach(() => { process.env = { ...saved }; _resetAiRpmForTests(null); });

  test("no store on the real production project refuses (every instance used to count on its own)", async () => {
    process.env.VERCEL_ENV = "production";
    assert.deepEqual(await checkAiRpm("w1", 10), AI_RPM_STORE_ERROR);
  });
  test("a store error refuses; a spent window refuses with the wait; an open one allows", async () => {
    _resetAiRpmForTests(() => async () => { throw new Error("redis down"); });
    assert.deepEqual(await checkAiRpm("w1", 10), AI_RPM_STORE_ERROR);
    _resetAiRpmForTests(() => async () => ({ success: false, reset: Date.now() + 4_000 }));
    const r = await checkAiRpm("w1", 10);
    assert.equal(r.ok, false);
    _resetAiRpmForTests(() => async () => ({ success: true, reset: 0 }));
    assert.deepEqual(await checkAiRpm("w1", 10), { ok: true });
  });
  test("outside production with no store, an in-memory window still meters per workspace", async () => {
    for (let i = 0; i < 3; i++) assert.equal((await checkAiRpm("wm", 3)).ok, true);
    assert.equal((await checkAiRpm("wm", 3)).ok, false);
    assert.equal((await checkAiRpm("other", 3)).ok, true);
  });
});
