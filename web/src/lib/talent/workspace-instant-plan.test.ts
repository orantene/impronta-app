/**
 * TUL-1712: the instant-booking rule on a workspace Menu save follows the WORKSPACE's owners'
 * plans, and with two owners the answer is the same whichever owner is read first.
 * Run: cd web && NODE_OPTIONS=--require ./scripts/register-server-only-test.cjs npx tsx --test src/lib/talent/workspace-instant-plan.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { INSTANT_PLAN_REFUSAL_EN } from "@/lib/talent/instant-plan-gate";
import {
  planTalentIds,
  workspaceAllowsInstant,
  workspaceOfferingSaveGate,
  type OfferingSaveGateDeps,
} from "@/lib/talent/offering-save-gate.server";
import { blankOffering, type TalentOffering } from "@/lib/talent/offerings-types";

type Reply = { data: null; error: null };
type FakeQuery = {
  select: (cols?: string) => FakeQuery;
  eq: (col: string, val: unknown) => FakeQuery;
  maybeSingle: () => Promise<Reply>;
};
const emptyDb = {
  from(): FakeQuery {
    const q: FakeQuery = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }) };
    return q;
  },
};

/** plans: owner talent id -> allows instant; an id not listed is unknown (the read returns nothing for it). */
function deps(plans: Record<string, boolean>): OfferingSaveGateDeps & { planReads: string[][] } {
  const planReads: string[][] = [];
  return {
    planReads,
    loadPosture: async () => "request",
    loadPlanAllowsInstant: async (_admin: SupabaseClient, ids: readonly string[]) => {
      planReads.push([...ids]);
      const out = new Map<string, boolean>();
      for (const id of ids) if (id in plans) out.set(id, plans[id]);
      return out;
    },
  };
}

function instantItem(): TalentOffering {
  return {
    ...blankOffering({ kind: "workspace", tenantId: "t1" }, "MXN", 0),
    title: "Same-day delivery",
    kind: "product",
    amountCents: 9000,
    bookingMode: "instant",
    status: "published",
  };
}

async function save(plans: Record<string, boolean>, owners: readonly string[], first: string | null) {
  const d = deps(plans);
  const res = await workspaceOfferingSaveGate(emptyDb, "t1", first, instantItem(), d, "en", owners);
  return { res, reads: d.planReads };
}

test("two owners: the result is the same whichever owner is read first", async () => {
  const plans = { "own-free": false, "own-paid": true };
  const a = await save(plans, ["own-free", "own-paid"], "own-free");
  const b = await save(plans, ["own-paid", "own-free"], "own-paid");
  assert.deepEqual(a.res, { ok: true });
  assert.deepEqual(b.res, a.res);
  assert.deepEqual(a.reads, b.reads, "the plan read is sorted, so order never shows");
  assert.deepEqual(a.reads, [["own-free", "own-paid"]]);
});

test("every owner on a plan without instant: refused, in either order", async () => {
  const plans = { "own-1": false, "own-2": false };
  const a = await save(plans, ["own-1", "own-2"], "own-1");
  const b = await save(plans, ["own-2", "own-1"], "own-2");
  assert.deepEqual(a.res, { ok: false, error: INSTANT_PLAN_REFUSAL_EN });
  assert.deepEqual(b.res, a.res);
});

test("a workspace with no readable owner plan never refuses (unknown plan), and one owner behaves as before", async () => {
  assert.deepEqual((await save({}, ["own-1", "own-2"], "own-1")).res, { ok: true });
  assert.deepEqual((await save({}, [], null)).res, { ok: true });
  const legacy = deps({ "owner-1": false });
  assert.deepEqual(
    await workspaceOfferingSaveGate(emptyDb, "t1", "owner-1", instantItem(), legacy),
    { ok: false, error: INSTANT_PLAN_REFUSAL_EN },
  );
  assert.deepEqual(legacy.planReads, [["owner-1"]], "callers that only know one owner keep working");
});

test("pure helpers: sorted unique plan ids; best known plan wins; unknown stays unknown", () => {
  assert.deepEqual(planTalentIds({ kind: "workspace", tenantId: "t", ownerTalentId: "b", ownerTalentIds: ["b", "a", "b"] }), ["a", "b"]);
  assert.deepEqual(planTalentIds({ kind: "workspace", tenantId: "t", ownerTalentId: null }), []);
  assert.deepEqual(planTalentIds({ kind: "talent", talentProfileId: "x" }), ["x"]);
  assert.equal(workspaceAllowsInstant(new Map([["a", false], ["b", true]]), ["a", "b"]), true);
  assert.equal(workspaceAllowsInstant(new Map([["a", false]]), ["a", "b"]), false);
  assert.equal(workspaceAllowsInstant(new Map(), ["a"]), undefined);
});
