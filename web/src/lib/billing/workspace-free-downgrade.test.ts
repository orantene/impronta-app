import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { downgradeWorkspaceToFree, type FreeDowngradeDeps } from "./workspace-free-downgrade";

type Pending = Parameters<FreeDowngradeDeps["applyAtStripe"]>[1];
type StripeResult = Awaited<ReturnType<FreeDowngradeDeps["applyAtStripe"]>>;

function harness(opts: { roster?: string[] | "throws"; cap?: number | null; stripe?: StripeResult; writeOk?: boolean } = {}) {
  const calls = { stripe: [] as Array<{ tenantId: string; pending: Pending }>, writes: [] as string[] };
  const deps: FreeDowngradeDeps = {
    async listRosterIds() {
      if (opts.roster === "throws") throw new Error("roster unreadable");
      return opts.roster ?? [];
    },
    freeSeatCap: () => (opts.cap === undefined ? 5 : opts.cap),
    newEventId: () => "11111111-1111-4111-8111-111111111111",
    nowIso: () => "2026-10-21T12:00:00.000Z",
    async applyAtStripe(tenantId, pending) {
      calls.stripe.push({ tenantId, pending });
      return opts.stripe ?? { ok: true, hadSubscription: false };
    },
    async writeFreeNow(tenantId) {
      calls.writes.push(tenantId);
      return opts.writeOk === false ? { ok: false } : { ok: true };
    },
  };
  return { deps, calls };
}

test("a workspace with a live Stripe subscription is downgraded AT STRIPE and nothing is written locally", async () => {
  const h = harness({ roster: ["a", "b"], stripe: { ok: true, hadSubscription: true, mode: "cancel_at_period_end", effectiveAt: "2026-11-01T00:00:00.000Z" } });
  const r = await downgradeWorkspaceToFree("t1", "u1", h.deps);
  assert.deepEqual(r, { ok: true, applied: "period_end", effectiveAt: "2026-11-01T00:00:00.000Z" });
  assert.equal(h.calls.stripe.length, 1);
  assert.deepEqual(h.calls.writes, [], "the webhook is the single writer of plan_tier");
  assert.equal(h.calls.stripe[0].tenantId, "t1");
  assert.equal(h.calls.stripe[0].pending.target_tier, "free");
  assert.equal(h.calls.stripe[0].pending.requested_by, "u1");
});

test("a roster that fits the Free cap keeps everyone; unlimited cap keeps everyone", async () => {
  const sub = { ok: true as const, hadSubscription: true as const, mode: "cancel_at_period_end" as const, effectiveAt: null };
  const under = harness({ roster: ["r1", "r2"], cap: 5, stripe: sub });
  await downgradeWorkspaceToFree("t1", "u1", under.deps);
  assert.deepEqual(under.calls.stripe[0].pending.keep_ids, ["r1", "r2"]);
  const unlimited = harness({ roster: ["r1", "r2", "r3", "r4", "r5", "r6", "r7"], cap: null, stripe: sub });
  await downgradeWorkspaceToFree("t1", "u1", unlimited.deps);
  assert.equal(unlimited.calls.stripe[0].pending.keep_ids.length, 7);
});

test("a roster above the Free cap is refused here (the owner picks who stays) and Stripe is never contacted", async () => {
  const h = harness({ roster: ["r1", "r2", "r3", "r4", "r5", "r6", "r7"], cap: 5 });
  const r = await downgradeWorkspaceToFree("t1", "u1", h.deps);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.needsKeepList, true);
  assert.equal(h.calls.stripe.length, 0);
  assert.deepEqual(h.calls.writes, []);
});

test("no live subscription (free, comped, ended at Stripe): the direct write, as before", async () => {
  const h = harness({ roster: ["a"] });
  assert.deepEqual(await downgradeWorkspaceToFree("t1", "u1", h.deps), { ok: true, applied: "now" });
  assert.deepEqual(h.calls.writes, ["t1"]);
});

test("a Stripe refusal changes nothing locally and says so", async () => {
  const h = harness({ roster: ["a"], stripe: { ok: false, error: "We could not change your Stripe subscription. Nothing was changed. Try again." } });
  const r = await downgradeWorkspaceToFree("t1", "u1", h.deps);
  assert.deepEqual(r, { ok: false, error: "We could not change your Stripe subscription. Nothing was changed. Try again." });
  assert.deepEqual(h.calls.writes, []);
});

test("an unreadable roster stops before Stripe is contacted (fail closed)", async () => {
  const h = harness({ roster: "throws" });
  const r = await downgradeWorkspaceToFree("t1", "u1", h.deps);
  assert.equal(r.ok, false);
  assert.equal(h.calls.stripe.length, 0);
  assert.deepEqual(h.calls.writes, []);
});

test("a failed direct write is an error, not a silent success", async () => {
  const h = harness({ writeOk: false });
  assert.equal((await downgradeWorkspaceToFree("t1", "u1", h.deps)).ok, false);
});

test("changeWorkspacePlan goes through the Stripe-first core and only clears the pending row on the immediate path", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/server-actions/admin-billing.ts"), "utf8");
  assert.match(src, /downgradeWorkspaceToFree\(auth\.tenantId, auth\.user\.id/);
  assert.match(src, /applyWorkspaceDowngrade\(tenantId, "free", pending\)/);
  assert.match(src, /if \(outcome\.applied === "now"\) \{\s*const cleared = await clearPendingDowngrade/);
  // The only agencies write is inside writeFreeNow (the no-subscription branch).
  const writes = src.match(/\.from\("agencies"\)/g) ?? [];
  assert.equal(writes.length, 1);
  assert.ok(src.indexOf('.from("agencies")') > src.indexOf("async writeFreeNow"));
});
