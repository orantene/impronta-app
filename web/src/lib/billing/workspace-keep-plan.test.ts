/**
 * TUL-1914 · "Keep my plan" for a workspace with a scheduled Free downgrade: Stripe first (the existing cancel-pending
 * code), then the keep-list row; nothing pending writes nothing; the server action carries the owner + read-only guards.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import type Stripe from "stripe";

import { cancelPendingPlanChange, loadPendingPlanChange } from "./plan-change-pending";
import type { PlanChangeStripe } from "./plan-change";
import { keepWorkspacePlan, type KeepWorkspacePlanDeps } from "./workspace-keep-plan";
import { roleGrantsCapability } from "@/lib/access/roles";
import { WORKSPACE_MONEY_GATES } from "./workspace-money-gates";

const PERIOD_END = 2_000_000_000;
const NOW = 1_800_000_000_000;

function fakeStripe(over: { cancelAtPeriodEnd?: boolean }, writes: string[]): PlanChangeStripe {
  const sub = {
    id: "sub_1",
    status: "active",
    customer: "cus_1",
    schedule: null,
    cancel_at_period_end: over.cancelAtPeriodEnd ?? false,
    cancel_at: null,
    metadata: { plan_key: "agency", tenant_id: "t1" },
    items: { data: [{ id: "si", current_period_start: 1, current_period_end: PERIOD_END, price: { id: "p", currency: "usd", recurring: { interval: "month" } } }] },
  } as unknown as Stripe.Subscription;
  return {
    subscriptions: {
      retrieve: async () => sub,
      update: async () => {
        writes.push("subscriptions.update");
        return sub;
      },
    },
    subscriptionSchedules: {
      release: async () => {
        writes.push("schedules.release");
        return {};
      },
    },
  } as unknown as PlanChangeStripe;
}

function deps(stripe: PlanChangeStripe, log: string[], clearOk = true): KeepWorkspacePlanDeps {
  return {
    cancelPending: async (id) => {
      const out = await cancelPendingPlanChange(stripe, { kind: "workspace", subjectId: id, subscriptionId: "sub_1" }, NOW);
      return out.ok ? out : { ok: false, error: out.error };
    },
    clearPending: async () => {
      log.push("clearPending");
      return clearOk ? { ok: true } : { ok: false };
    },
    onClearFailed: () => log.push("clearFailed"),
  };
}

test("scheduled Free: one Stripe write clears the cancel, then the keep-list row is dropped", async () => {
  const writes: string[] = [];
  const log: string[] = [];
  const out = await keepWorkspacePlan("t1", deps(fakeStripe({ cancelAtPeriodEnd: true }, writes), log));
  assert.deepEqual(out, { ok: true, hadPending: true });
  assert.deepEqual(writes, ["subscriptions.update"]);
  assert.deepEqual(log, ["clearPending"]);
});

test("nothing pending: no Stripe write and the keep-list row is untouched", async () => {
  const writes: string[] = [];
  const log: string[] = [];
  const out = await keepWorkspacePlan("t1", deps(fakeStripe({}, writes), log));
  assert.deepEqual(out, { ok: true, hadPending: false });
  assert.deepEqual(writes, []);
  assert.deepEqual(log, []);
});

test("a refused Stripe undo leaves the keep-list row alone and reports the error", async () => {
  const log: string[] = [];
  const out = await keepWorkspacePlan("t1", {
    ...deps(fakeStripe({ cancelAtPeriodEnd: true }, []), log),
    cancelPending: async () => ({ ok: false, error: "We could not cancel the change. Try again." }),
  });
  assert.deepEqual(out, { ok: false, error: "We could not cancel the change. Try again." });
  assert.deepEqual(log, []);
});

test("a failed row delete after the undo is logged, the undo still reads as done", async () => {
  const log: string[] = [];
  const out = await keepWorkspacePlan("t1", deps(fakeStripe({ cancelAtPeriodEnd: true }, []), log, false));
  assert.deepEqual(out, { ok: true, hadPending: true });
  assert.deepEqual(log, ["clearPending", "clearFailed"]);
});

test("the pending read reports Free at the period end for a scheduled cancel", async () => {
  const out = await loadPendingPlanChange(fakeStripe({ cancelAtPeriodEnd: true }, []), { kind: "workspace", subjectId: "t1", subscriptionId: "sub_1" }, NOW);
  assert.ok(out.ok);
  assert.equal(out.ok && out.pending?.toPlan, "talent_basic");
  assert.equal(out.ok && out.pending?.effectiveAt, new Date(PERIOD_END * 1000).toISOString());
});

test("the server action: not impersonating, owner capability, before any Stripe or database call; only the read is allow-listed", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/server-actions/admin-pending-plan-change.ts"), "utf8");
  const keep = src.slice(src.indexOf("export async function keepWorkspaceCurrentPlan"));
  assert.ok(keep.indexOf("requireNotImpersonating()") > -1);
  assert.ok(keep.indexOf("requireNotImpersonating()") < keep.indexOf("requireWorkspaceStaffAction"));
  assert.ok(keep.indexOf("requireWorkspaceStaffAction") < keep.indexOf("cancelPendingPlanChangeFor"));
  assert.match(keep, /capability: WORKSPACE_MONEY_GATES\.planChange/);
  assert.match(src.slice(0, src.indexOf("export async function keepWorkspaceCurrentPlan")), /capability: WORKSPACE_MONEY_GATES\.planChange/);
  assert.equal(WORKSPACE_MONEY_GATES.planChange, "manage_billing");
  assert.equal(roleGrantsCapability("owner", "manage_billing"), true);
  for (const r of ["admin", "manager", "editor", "viewer"]) assert.equal(roleGrantsCapability(r, "manage_billing"), false, r);
  const allow = readFileSync(join(process.cwd(), "src/lib/impersonation/readonly-actions.allow.ts"), "utf8");
  assert.match(allow, /"loadWorkspacePendingPlanChange"/);
  assert.doesNotMatch(allow, /"keepWorkspaceCurrentPlan"/);
});

test("copy: scheduled, keep and kept exist in en and es without em dashes", () => {
  const m = (l: string) =>
    (JSON.parse(readFileSync(join(process.cwd(), `messages/${l}.json`), "utf8")) as { dashboard: { adminShared: { planChange: Record<string, string> } } }).dashboard.adminShared.planChange;
  for (const l of ["en", "es"]) for (const k of ["scheduledFree", "keepPlan", "keptPlan", "alreadyScheduled"]) {
    assert.ok(m(l)[k], `${l}.${k}`);
    assert.doesNotMatch(m(l)[k], /—/);
  }
  assert.equal(m("es").scheduledFree.replace("{date}", "22 de noviembre de 2026"), "Cambia a Gratis el 22 de noviembre de 2026");
});
