/**
 * TUL-1737: a paid downgrade archives the roster at PERIOD END (when the webhook drops the tier), the confirm path only
 * records the schedule + keep-list, going to FREE releases a pending schedule first, and unpaid / incomplete / paused
 * subscriptions are never treated as "no subscription". Fake Stripe + typed fake admin, no network, no `any`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import type { PlanChangeStripe } from "./plan-change";
import { isActionableSubscriptionStatus, isExistingSubscriptionStatus } from "./subscription-live-status";
import {
  applyPendingDowngradeAtTierDrop,
  keepListFilter,
  parsePendingDowngrade,
  recordPendingDowngrade,
  type PendingDowngrade,
} from "./workspace-downgrade-archive";
import { applyWorkspaceDowngradeAtStripe, type WorkspaceDowngradeDeps } from "./workspace-downgrade-stripe";

const TENANT = "t1";
const OWNER = "00000000-0000-4000-8000-0000000000aa";
const EVENT = "00000000-0000-4000-8000-0000000000ee";
const T = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const KEEP = [T(1), T(2)];

// ─── typed fake admin ─────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
type Filter = { kind: "eq" | "in" | "notin"; col: string; val: unknown };
type Result = { data: Row | null; error: { message: string } | null; count: number | null };

class FakeQuery implements PromiseLike<Result> {
  private op: "select" | "update" = "select";
  private patch: Row = {};
  private wantCount = false;
  private filters: Filter[] = [];
  constructor(private readonly db: FakeAdmin, private readonly table: string) {}
  select(): this { this.op = "select"; return this; }
  update(patch: Row, opts?: { count?: string }): this { this.op = "update"; this.patch = patch; this.wantCount = opts?.count === "exact"; return this; }
  eq(col: string, val: unknown): this { this.filters.push({ kind: "eq", col, val }); return this; }
  in(col: string, val: unknown[]): this { this.filters.push({ kind: "in", col, val }); return this; }
  not(col: string, _op: string, raw: string): this {
    const ids = raw.slice(1, -1).split(",").map((s) => s.replace(/"/g, "")).filter((s) => s.length > 0 && s !== "''");
    this.filters.push({ kind: "notin", col, val: ids });
    return this;
  }
  private matches(row: Row): boolean {
    return this.filters.every((f) => {
      if (f.kind === "eq") return row[f.col] === f.val;
      if (f.kind === "in") return (f.val as unknown[]).includes(row[f.col]);
      return !(f.val as unknown[]).includes(row[f.col]);
    });
  }
  private run(): Result {
    const rows = this.db.rows(this.table);
    const hit = rows.filter((r) => this.matches(r));
    const failure = this.db.failure(this.table, this.op);
    if (failure) return { data: null, error: { message: failure }, count: null };
    if (this.op === "update") {
      for (const r of hit) Object.assign(r, this.patch);
      this.db.writes.push({ table: this.table, patch: this.patch, count: hit.length });
      return { data: null, error: null, count: this.wantCount ? hit.length : null };
    }
    return { data: hit[0] ?? null, error: null, count: null };
  }
  maybeSingle(): Promise<Result> { return Promise.resolve(this.run()); }
  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(ok, bad);
  }
}

class FakeAdmin {
  tables: Record<string, Row[]> = { workspace_subscriptions: [{ tenant_id: TENANT, pending_downgrade: null }], agency_talent_roster: [] };
  writes: Array<{ table: string; patch: Row; count: number }> = [];
  failures = new Set<string>();
  from(table: string): FakeQuery { return new FakeQuery(this, table); }
  rows(table: string): Row[] { return this.tables[table] ?? []; }
  failure(table: string, op: string): string | null { return this.failures.has(`${table}:${op}`) ? `${table} ${op} failed` : null; }
  asClient(): SupabaseClient { return this as unknown as SupabaseClient; }
  seedRoster(n: number): void {
    this.tables.agency_talent_roster = Array.from({ length: n }, (_, i) => ({
      tenant_id: TENANT, talent_profile_id: T(i + 1), status: "active", archived_for_downgrade_event: null,
    }));
  }
  archived(): Row[] { return this.rows("agency_talent_roster").filter((r) => r.status === "archived_for_downgrade"); }
  pending(): unknown { return this.rows("workspace_subscriptions")[0]?.pending_downgrade ?? null; }
}

const intent = (over: Partial<PendingDowngrade> = {}): PendingDowngrade => ({
  target_tier: "studio", keep_ids: KEEP, archive_event_id: EVENT, requested_by: OWNER, requested_at: "2026-10-21T00:00:00.000Z", ...over,
});

// ─── fake Stripe ──────────────────────────────────────────────────────────────

type Call = { method: string; args: unknown[] };
const PERIOD_END = 2_000_000_000;

function sub(over: { plan?: string; status?: string; schedule?: string | null } = {}): Stripe.Subscription {
  return {
    id: "sub_1",
    status: over.status ?? "active",
    trial_end: null,
    customer: "cus_1",
    schedule: over.schedule ?? null,
    metadata: { plan_key: over.plan ?? "agency", tenant_id: TENANT },
    items: { data: [{ id: "si_1", current_period_start: 1_000, current_period_end: PERIOD_END, price: { id: "price_cur", currency: "usd", recurring: { interval: "month" } } }] },
  } as unknown as Stripe.Subscription;
}

function world(over: Parameters<typeof sub>[0] = {}, admin = new FakeAdmin()) {
  const log: string[] = [];
  const calls: Call[] = [];
  const rec = (method: string, ret: unknown) => async (...args: unknown[]) => {
    calls.push({ method, args });
    log.push(method);
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
  let cancels = 0;
  const deps: WorkspaceDowngradeDeps = {
    readSubscriptionId: async () => "sub_1",
    recordPending: async (id) => {
      log.push("recordPending");
      const r = await recordPendingDowngrade(admin.asClient(), id, intent());
      return r.ok ? { ok: true } : { ok: false };
    },
    stripe: () => stripe as ReturnType<WorkspaceDowngradeDeps["stripe"]>,
    resolvePriceId: async (plan) => `price_${plan}`,
    cancelAtPeriodEnd: async () => { cancels += 1; log.push("cancel"); return { ok: true, effectiveAt: "2033-05-18T03:33:20.000Z" }; },
    now: () => 1_700_000_000_000,
  };
  return { admin, calls, log, deps, cancels: () => cancels };
}
const stripeWrites = (calls: Call[]) => calls.filter((c) => /subscriptions\.update|schedules\.(create|update|release)/.test(c.method)).map((c) => c.method);

// ─── items 1 + 2: confirm records, the webhook archives ───────────────────────

describe("confirm path: records the schedule + keep-list, archives nobody", () => {
  test("scheduled downgrade stores the keep-list with the pending change and leaves the roster untouched", async () => {
    const w = world();
    w.admin.seedRoster(5);
    const r = await applyWorkspaceDowngradeAtStripe(TENANT, "studio", w.deps);
    assert.ok(r.ok && r.hadSubscription && r.mode === "schedule");
    assert.deepEqual(w.admin.pending(), intent());
    assert.equal(w.admin.archived().length, 0, "the customer paid until period end: nobody is archived at confirm");
    assert.ok(w.log.indexOf("recordPending") < w.log.indexOf("schedules.create"), "keep-list persisted BEFORE the first Stripe write");
  });

  test("a failure persisting the keep-list is surfaced and makes ZERO Stripe writes, so a retry cannot duplicate anything", async () => {
    const w = world();
    w.admin.failures.add("workspace_subscriptions:update");
    const r = await applyWorkspaceDowngradeAtStripe(TENANT, "studio", w.deps);
    assert.equal(r.ok, false);
    assert.match(!r.ok ? r.error : "", /Nothing was changed/);
    assert.deepEqual(stripeWrites(w.calls), []);
    // The owner retries once the store is healthy: exactly one schedule is created.
    w.admin.failures.clear();
    const again = await applyWorkspaceDowngradeAtStripe(TENANT, "studio", w.deps);
    assert.equal(again.ok, true);
    assert.equal(stripeWrites(w.calls).filter((m) => m === "schedules.create").length, 1);
  });

  test("a missing subscription row (nothing to hold the keep-list) is a failure, not a silent skip", async () => {
    const w = world();
    w.admin.tables.workspace_subscriptions = [];
    const r = await applyWorkspaceDowngradeAtStripe(TENANT, "studio", w.deps);
    assert.equal(r.ok, false);
    assert.deepEqual(stripeWrites(w.calls), []);
  });

  test("no live subscription: the keep-list is never stored (the caller archives immediately)", async () => {
    const w = world();
    const r = await applyWorkspaceDowngradeAtStripe(TENANT, "studio", { ...w.deps, readSubscriptionId: async () => null });
    assert.deepEqual(r, { ok: true, hadSubscription: false });
    assert.equal(w.admin.pending(), null);
  });
});

describe("webhook: archive only when the tier actually drops, once", () => {
  async function drop(admin: FakeAdmin, newTier: string) {
    return applyPendingDowngradeAtTierDrop(admin.asClient(), { tenantId: TENANT, newTier, nowIso: "2026-11-21T00:00:00.000Z" });
  }
  function pendingWorld(roster = 5) {
    const admin = new FakeAdmin();
    admin.seedRoster(roster);
    admin.rows("workspace_subscriptions")[0].pending_downgrade = intent();
    return admin;
  }

  test("a mid-period resync (tier still agency) archives nothing and keeps the keep-list", async () => {
    const admin = pendingWorld();
    const out = await drop(admin, "agency");
    assert.deepEqual(out, { ok: true, kind: "not_yet" });
    assert.equal(admin.archived().length, 0);
    assert.deepEqual(admin.pending(), intent());
  });

  test("the tier reaches the target: overflow is archived under the stored event id, the keep-list stays active, pending is cleared", async () => {
    const admin = pendingWorld(5);
    const out = await drop(admin, "studio");
    assert.deepEqual(out, { ok: true, kind: "archived", archived: 3, eventId: EVENT });
    const archived = admin.archived();
    assert.deepEqual(archived.map((r) => r.talent_profile_id), [T(3), T(4), T(5)]);
    assert.ok(archived.every((r) => r.archived_for_downgrade_event === EVENT && r.archived_for_downgrade_by === OWNER));
    assert.deepEqual(admin.rows("agency_talent_roster").filter((r) => r.status === "active").map((r) => r.talent_profile_id), KEEP);
    assert.equal(admin.pending(), null);
  });

  test("a REPLAYED webhook archives once: the second delivery finds nothing pending", async () => {
    const admin = pendingWorld(5);
    await drop(admin, "studio");
    const rosterWrites = () => admin.writes.filter((w) => w.table === "agency_talent_roster").length;
    const before = rosterWrites();
    assert.deepEqual(await drop(admin, "studio"), { ok: true, kind: "none" });
    assert.equal(rosterWrites(), before, "no second archive write");
    assert.equal(admin.archived().length, 3);
  });

  test("a replay that races ahead of the clear archives zero additional rows (only active/pending rows are touched)", async () => {
    const admin = pendingWorld(5);
    await drop(admin, "studio");
    admin.rows("workspace_subscriptions")[0].pending_downgrade = intent(); // clear lost
    const out = await drop(admin, "studio");
    assert.deepEqual(out, { ok: true, kind: "archived", archived: 0, eventId: EVENT });
    assert.equal(admin.archived().length, 3);
  });

  test("an archive failure fails the sync (Stripe retries) and KEEPS the pending row; the retry finishes the job", async () => {
    const admin = pendingWorld(5);
    admin.failures.add("agency_talent_roster:update");
    const out = await drop(admin, "studio");
    assert.equal(out.ok, false);
    assert.deepEqual(admin.pending(), intent());
    admin.failures.clear();
    assert.deepEqual(await drop(admin, "studio"), { ok: true, kind: "archived", archived: 3, eventId: EVENT });
  });

  test("dropping to a different tier than the one the owner chose does not apply the keep-list", async () => {
    const admin = pendingWorld();
    assert.deepEqual(await drop(admin, "free"), { ok: true, kind: "not_yet" });
    assert.equal(admin.archived().length, 0);
  });

  test("going to FREE archives everyone outside the keep-list at the cancel (empty keep-list archives all)", async () => {
    const admin = new FakeAdmin();
    admin.seedRoster(3);
    admin.rows("workspace_subscriptions")[0].pending_downgrade = intent({ target_tier: "free", keep_ids: [] });
    assert.deepEqual(await drop(admin, "free"), { ok: true, kind: "archived", archived: 3, eventId: EVENT });
  });

  test("no pending row, an unreadable column (not migrated yet), or malformed JSON never wedges the webhook and archives nothing", async () => {
    const none = new FakeAdmin();
    none.seedRoster(3);
    assert.deepEqual(await drop(none, "studio"), { ok: true, kind: "none" });
    const unreadable = pendingWorld();
    unreadable.failures.add("workspace_subscriptions:select");
    assert.deepEqual(await drop(unreadable, "studio"), { ok: true, kind: "none" });
    assert.equal(unreadable.archived().length, 0);
    const bad = pendingWorld();
    bad.rows("workspace_subscriptions")[0].pending_downgrade = { target_tier: "studio", keep_ids: ["x'); drop table"], archive_event_id: EVENT, requested_by: OWNER };
    assert.deepEqual(await drop(bad, "studio"), { ok: true, kind: "none" });
    assert.equal(bad.archived().length, 0);
  });

  test("parse + filter helpers", () => {
    assert.equal(parsePendingDowngrade(null), null);
    assert.deepEqual(parsePendingDowngrade(intent())?.keep_ids, KEEP);
    assert.equal(keepListFilter([]), "('')");
    assert.equal(keepListFilter(KEEP), `("${KEEP[0]}","${KEEP[1]}")`);
  });
});

// ─── item 3: FREE while a plan-change schedule is already pending ─────────────

describe("to FREE while a plan-change schedule is pending", () => {
  test("releases the schedule FIRST, then cancels at period end: no new schedule, one pending state", async () => {
    const w = world({ plan: "studio", schedule: "sub_sched_old" });
    const r = await applyWorkspaceDowngradeAtStripe(TENANT, "free", w.deps);
    assert.deepEqual(r, { ok: true, hadSubscription: true, mode: "cancel_at_period_end", effectiveAt: "2033-05-18T03:33:20.000Z" });
    assert.deepEqual(stripeWrites(w.calls), ["schedules.release"]);
    assert.equal(w.cancels(), 1);
    assert.deepEqual(w.log.filter((m) => ["recordPending", "schedules.release", "cancel"].includes(m)), ["recordPending", "schedules.release", "cancel"]);
    const release = w.calls.find((c) => c.method === "schedules.release")!;
    assert.equal(release.args[0], "sub_sched_old");
    assert.match((release.args[2] as { idempotencyKey: string }).idempotencyKey, /sub_1/);
  });

  test("with no schedule attached nothing is released, just the cancel", async () => {
    const w = world({ plan: "studio" });
    await applyWorkspaceDowngradeAtStripe(TENANT, "free", w.deps);
    assert.deepEqual(stripeWrites(w.calls), []);
    assert.equal(w.cancels(), 1);
  });

  test("a failed cancel after the release fails the call (owner sees an error, nothing is reported as scheduled)", async () => {
    const w = world({ plan: "studio", schedule: "sub_sched_old" });
    const r = await applyWorkspaceDowngradeAtStripe(TENANT, "free", { ...w.deps, cancelAtPeriodEnd: async () => ({ ok: false, error: "no" }) });
    assert.equal(r.ok, false);
  });

  test("the free keep-list replaces the earlier paid-downgrade keep-list (single pending state)", async () => {
    const w = world({ plan: "studio", schedule: "sub_sched_old" });
    w.admin.rows("workspace_subscriptions")[0].pending_downgrade = intent({ target_tier: "website" });
    await applyWorkspaceDowngradeAtStripe(TENANT, "free", { ...w.deps, recordPending: async (id) => (await recordPendingDowngrade(w.admin.asClient(), id, intent({ target_tier: "free", keep_ids: [] }))).ok ? { ok: true } : { ok: false } });
    assert.equal((w.admin.pending() as PendingDowngrade).target_tier, "free");
  });
});

// ─── item 4: unpaid / incomplete / paused are EXISTING subscriptions ──────────

describe("unpaid, incomplete and paused count as a live subscription", () => {
  test("status predicates", () => {
    for (const s of ["active", "trialing", "past_due", "unpaid", "incomplete", "paused"]) assert.equal(isExistingSubscriptionStatus(s), true, s);
    for (const s of ["canceled", "cancelled", "incomplete_expired"]) assert.equal(isExistingSubscriptionStatus(s), false, s);
    for (const s of ["unpaid", "incomplete", "paused", "canceled"]) assert.equal(isActionableSubscriptionStatus(s), false, s);
    for (const s of ["active", "trialing", "past_due"]) assert.equal(isActionableSubscriptionStatus(s), true, s);
  });

  test("Stripe says unpaid / incomplete / paused: the downgrade is REFUSED, never turned into a local tier write", async () => {
    for (const status of ["unpaid", "incomplete", "paused"]) {
      for (const target of ["studio", "free"] as const) {
        const w = world({ plan: "agency", status });
        const r = await applyWorkspaceDowngradeAtStripe(TENANT, target, w.deps);
        assert.equal(r.ok, false, `${status}->${target}`);
        assert.deepEqual(stripeWrites(w.calls), [], `${status}->${target}`);
        assert.equal(w.cancels(), 0, `${status}->${target}`);
        assert.equal(w.admin.pending(), null, `${status}->${target}`);
      }
    }
  });

  test("an ended subscription is still 'none' (the caller's local write is right)", async () => {
    for (const status of ["canceled", "incomplete_expired"]) {
      const r = await applyWorkspaceDowngradeAtStripe(TENANT, "studio", world({ status }).deps);
      assert.deepEqual(r, { ok: true, hadSubscription: false }, status);
    }
  });

  test("both local readers use the shared predicate", () => {
    const reads = readFileSync(join(process.cwd(), "src/lib/stripe/workspace-subscription-reads.ts"), "utf8");
    const server = readFileSync(join(process.cwd(), "src/lib/billing/plan-change.server.ts"), "utf8");
    assert.match(reads, /return isExistingSubscriptionStatus\(row\.status\);/);
    assert.match(server, /isExistingSubscriptionStatus\(row\.status\) \? row\.stripe_subscription_id : null/);
  });
});

// ─── wiring ───────────────────────────────────────────────────────────────────

describe("wiring", () => {
  const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  test("the single tier writer runs the pending-downgrade archive after the tier write, guarded by a successful write", () => {
    const s = src("src/lib/stripe/workspace-billing.ts");
    const tierWrite = s.indexOf("plan_tier: newPlanTier");
    const call = s.indexOf("applyPendingDowngradeAtTierDrop(sb");
    assert.ok(tierWrite > 0 && call > tierWrite);
    assert.match(s.slice(call - 80, call), /if \(!agencyError\)|const pending = await/);
    assert.match(s.slice(call, call + 400), /if \(!pending\.ok\)[\s\S]*return \{ ok: false/);
  });
  test("commitPlanDowngrade archives immediately ONLY without a subscription", () => {
    const s = src("src/lib/server-actions/admin-plan-downgrade.ts");
    const idx = s.indexOf("archiveRosterOverflow(supabase");
    assert.ok(idx > 0);
    assert.match(s.slice(idx - 80, idx), /if \(!stripeStep\.hadSubscription\) \{\s+const archived = await $/);
  });
  test("the migration is additive and parked", () => {
    const m = src("../supabase/migrations/_pending_pm/20261231424400_workspace_pending_downgrade.sql");
    assert.match(m, /ADD COLUMN IF NOT EXISTS pending_downgrade jsonb/);
    assert.ok(!/DROP|DELETE|NOT NULL/i.test(m.replace(/--.*$/gm, "")));
  });
});
