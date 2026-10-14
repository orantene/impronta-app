import assert from "node:assert/strict";
import test from "node:test";
import {
  catalogIntervalFor,
  decideTalentPlanChange,
  runTalentPlanChange,
  type TalentPlanChangeDeps,
  type TalentPlanChangeRow,
} from "./talent-plan-change";
import type { TalentPlanKey } from "@/lib/stripe/price-ids";

const OWNER = "user-owner";

function row(over: Partial<TalentPlanChangeRow> = {}): TalentPlanChangeRow {
  return { user_id: OWNER, stripe_subscription_id: "sub_test_1", status: "active", plan_key: "talent_pro", ...over };
}

function fakeDeps(r: TalentPlanChangeRow | null, opts: { throws?: boolean; noPrice?: boolean } = {}) {
  const calls: Array<[string, TalentPlanKey]> = [];
  const deps: TalentPlanChangeDeps = {
    loadRow: async () => r,
    changePrice: async (id, target) => {
      calls.push([id, target]);
      if (opts.throws) throw new Error("stripe down");
      return !opts.noPrice;
    },
  };
  return { deps, calls };
}

test("owner upgrades pro to portfolio: Stripe is called with the row's subscription", async () => {
  const { deps, calls } = fakeDeps(row());
  const out = await runTalentPlanChange(deps, { talentProfileId: "tp1", callerUserId: OWNER, target: "talent_portfolio" });
  assert.deepEqual(out, { ok: true, planKey: "talent_portfolio" });
  assert.deepEqual(calls, [["sub_test_1", "talent_portfolio"]]);
});

test("downgrade portfolio to pro is the same path", async () => {
  const { deps, calls } = fakeDeps(row({ plan_key: "talent_portfolio" }));
  const out = await runTalentPlanChange(deps, { talentProfileId: "tp1", callerUserId: OWNER, target: "talent_pro" });
  assert.equal(out.ok, true);
  assert.equal(calls.length, 1);
});

test("another user's subscription reads as not_found and never reaches Stripe", async () => {
  const { deps, calls } = fakeDeps(row({ user_id: "someone-else" }));
  const out = await runTalentPlanChange(deps, { talentProfileId: "tp1", callerUserId: OWNER, target: "talent_portfolio" });
  assert.deepEqual(out, { ok: false, code: "not_found" });
  assert.equal(calls.length, 0);
});

test("same plan, ended, past_due and missing subscription are refused before Stripe", () => {
  assert.deepEqual(decideTalentPlanChange(row(), OWNER, "talent_pro"), { kind: "error", code: "same_plan" });
  assert.deepEqual(decideTalentPlanChange(row({ status: "cancelled" }), OWNER, "talent_portfolio"), { kind: "error", code: "already_ended" });
  assert.deepEqual(decideTalentPlanChange(row({ status: "past_due" }), OWNER, "talent_portfolio"), { kind: "error", code: "past_due" });
  assert.deepEqual(decideTalentPlanChange(row({ stripe_subscription_id: null }), OWNER, "talent_portfolio"), { kind: "error", code: "no_subscription" });
  assert.deepEqual(decideTalentPlanChange(null, OWNER, "talent_portfolio"), { kind: "error", code: "not_found" });
  assert.deepEqual(decideTalentPlanChange(row(), "", "talent_portfolio"), { kind: "error", code: "not_found" });
});

test("trialing subscriptions can change plan", () => {
  assert.equal(decideTalentPlanChange(row({ status: "trialing" }), OWNER, "talent_portfolio").kind, "stripe");
});

test("Stripe failure and missing price are reported, not swallowed", async () => {
  const failed = await runTalentPlanChange(fakeDeps(row(), { throws: true }).deps, { talentProfileId: "tp1", callerUserId: OWNER, target: "talent_portfolio" });
  assert.deepEqual(failed, { ok: false, code: "stripe_failed" });
  const noPrice = await runTalentPlanChange(fakeDeps(row(), { noPrice: true }).deps, { talentProfileId: "tp1", callerUserId: OWNER, target: "talent_portfolio" });
  assert.deepEqual(noPrice, { ok: false, code: "price_unavailable" });
});

test("interval mapping keeps yearly on yearly", () => {
  assert.equal(catalogIntervalFor("year"), "annual");
  assert.equal(catalogIntervalFor("month"), "monthly");
  assert.equal(catalogIntervalFor(null), "monthly");
});
