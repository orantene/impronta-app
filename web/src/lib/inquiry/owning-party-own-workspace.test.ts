/**
 * Payout rule (owner decision 2026-10-01, "talent = merchant"): a sale made in
 * the talent's OWN workspace (workspace_type 'talent') is the talent's sale for
 * MONEY, so the snapshot and payout leg treat the talent as seller of record.
 * The shared resolver is unchanged: who coordinates / sees the inquiry still
 * follows the frozen participant row.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { moneyOwningParty, resolveOwningPartiesForTalents, resolveOwningPartyForTalent } from "./owning-party-resolver";

function sbWith(workspaceType: string | null, roster?: unknown[]) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    maybeSingle: () => Promise.resolve({ data: { workspace_type: workspaceType }, error: null }),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: roster ?? [], error: null }).then(resolve),
  };
  return { from: () => builder } as unknown as Parameters<typeof moneyOwningParty>[0];
}

test("a workspace-owned lane in the talent's own workspace is the talent's for money", async () => {
  assert.deepEqual(await moneyOwningParty(sbWith("talent"), { type: "workspace", id: "ws" }, "t1"), { type: "talent", id: "t1" });
});

test("a real business workspace, an agency lane and an already-talent lane are unchanged", async () => {
  assert.deepEqual(await moneyOwningParty(sbWith("agency"), { type: "workspace", id: "ws" }, "t1"), { type: "workspace", id: "ws" });
  assert.deepEqual(await moneyOwningParty(sbWith(null), { type: "workspace", id: "ws" }, "t1"), { type: "workspace", id: "ws" });
  assert.deepEqual(await moneyOwningParty(sbWith("talent"), { type: "agency", id: "ag" }, "t1"), { type: "agency", id: "ag" });
  assert.deepEqual(await moneyOwningParty(sbWith("talent"), { type: "talent", id: "t1" }, "t1"), { type: "talent", id: "t1" });
  assert.deepEqual(await moneyOwningParty(sbWith("talent"), { type: "workspace", id: "ws" }, null), { type: "workspace", id: "ws" });
});

test("a failed agencies read throws instead of guessing 'workspace'", async () => {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: () => Promise.resolve({ data: null, error: { message: "boom" } }),
  };
  const sb = { from: () => builder } as unknown as Parameters<typeof moneyOwningParty>[0];
  await assert.rejects(() => moneyOwningParty(sb, { type: "workspace", id: "ws" }, "t1"), /could not read workspace_type/);
});

test("the shared resolver still freezes a workspace lane for the talent's own workspace (visibility and coordination unchanged)", async () => {
  const roster = [
    { tenant_id: "ws", talent_profile_id: "t1", is_primary: true, status: "active", exclusivity_status: null, agencies: { id: "ws", plan_tier: "free", workspace_type: "talent" } },
  ];
  assert.deepEqual(await resolveOwningPartyForTalent(sbWith("talent", roster), "t1", "ws"), { type: "workspace", id: "ws" });
  assert.deepEqual((await resolveOwningPartiesForTalents(sbWith("talent", roster), ["t1"], "ws")).get("t1"), { type: "workspace", id: "ws" });
  assert.deepEqual(await resolveOwningPartyForTalent(sbWith("talent", roster), "t1"), { type: "workspace", id: "ws" });
});

test("the money callers apply the mapping", async () => {
  const { readFileSync } = await import("node:fs");
  assert.match(readFileSync("src/lib/billing/commission-engine.ts", "utf8"), /moneyOwningParty\(supabase/);
  assert.match(readFileSync("src/lib/orders/purchase-pass-through-collect.ts", "utf8"), /moneyOwningParty\(admin/);
});
