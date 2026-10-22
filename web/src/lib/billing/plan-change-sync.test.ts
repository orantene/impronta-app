import assert from "node:assert/strict";
import { test } from "node:test";

import { syncTalentPlanAfterConfirm, type PlanChangeSyncDeps } from "./plan-change-sync";
import type { PlanChangeConfirm } from "./plan-change-policy";

type Sub = { id: string };
type Call = { planKey: string; talentProfileId: string };

function fakeDeps(opts: { syncOk?: boolean; retrieveThrows?: boolean } = {}): { deps: PlanChangeSyncDeps<Sub>; calls: Call[]; retrieved: string[] } {
  const calls: Call[] = [];
  const retrieved: string[] = [];
  return {
    calls,
    retrieved,
    deps: {
      retrieveSubscription: async (id) => {
        retrieved.push(id);
        if (opts.retrieveThrows) throw new Error("stripe down");
        return { id };
      },
      syncToDb: async (_sub, planKey, o) => {
        calls.push({ planKey, talentProfileId: o.talentProfileId });
        return opts.syncOk === false ? { ok: false } : { ok: true };
      },
      onError: () => {},
    },
  };
}

const now = (kind: "upgrade" | "downgrade" | "noop", timing: "now" | "period_end" = "now"): PlanChangeConfirm => ({
  ok: true,
  kind,
  timing,
  effectiveAt: null,
});

test("an immediate upgrade writes the new plan key (Pro to Web Office) without waiting for the webhook", async () => {
  const { deps, calls, retrieved } = fakeDeps();
  const out = await syncTalentPlanAfterConfirm(deps, { subscriptionId: "sub_1", toPlan: "talent_portfolio", talentProfileId: "tp1" }, now("upgrade"));
  assert.deepEqual(out, { synced: true });
  assert.deepEqual(retrieved, ["sub_1"]);
  assert.deepEqual(calls, [{ planKey: "talent_portfolio", talentProfileId: "tp1" }]);
});

test("a period-end change does not touch the plan row (the plan has not changed yet)", async () => {
  const { deps, calls } = fakeDeps();
  const out = await syncTalentPlanAfterConfirm(deps, { subscriptionId: "sub_1", toPlan: "talent_pro", talentProfileId: "tp1" }, now("downgrade", "period_end"));
  assert.deepEqual(out, { synced: false });
  assert.equal(calls.length, 0);
});

test("a no-op and a failed confirm never write", async () => {
  const { deps, calls } = fakeDeps();
  assert.deepEqual(await syncTalentPlanAfterConfirm(deps, { subscriptionId: "s", toPlan: "talent_pro", talentProfileId: "tp1" }, now("noop")), { synced: false });
  assert.deepEqual(
    await syncTalentPlanAfterConfirm(deps, { subscriptionId: "s", toPlan: "talent_pro", talentProfileId: "tp1" }, { ok: false, error: "x" }),
    { synced: false },
  );
  assert.equal(calls.length, 0);
});

test("the free target is never synced from here (downgrade to free is period-end)", async () => {
  const { deps, calls } = fakeDeps();
  const out = await syncTalentPlanAfterConfirm(deps, { subscriptionId: "s", toPlan: "talent_basic", talentProfileId: "tp1" }, now("downgrade", "now"));
  assert.deepEqual(out, { synced: false });
  assert.equal(calls.length, 0);
});

test("a Stripe or DB failure is swallowed (the change already happened; the webhook is the backstop)", async () => {
  const a = fakeDeps({ retrieveThrows: true });
  assert.deepEqual(await syncTalentPlanAfterConfirm(a.deps, { subscriptionId: "s", toPlan: "talent_portfolio", talentProfileId: "tp1" }, now("upgrade")), { synced: false });
  const b = fakeDeps({ syncOk: false });
  assert.deepEqual(await syncTalentPlanAfterConfirm(b.deps, { subscriptionId: "s", toPlan: "talent_portfolio", talentProfileId: "tp1" }, now("upgrade")), { synced: false });
});

test("wiring: confirmPlanChangeFor syncs the talent plan row; the server action revalidates the shell", async () => {
  const { readFileSync } = await import("node:fs");
  const server = readFileSync("src/lib/billing/plan-change.server.ts", "utf8");
  assert.match(server, /syncTalentPlanAfterConfirm\(/);
  const action = readFileSync("src/app/(workspace)/[tenantSlug]/talent/settings/plan-change-actions.ts", "utf8");
  assert.match(action, /revalidatePath\(`\/\$\{tenantSlug\}`, "layout"\)/);
});
