/**
 * Payout rule (owner decision 2026-10-01, "talent = merchant"): a sale made in
 * the talent's OWN workspace (workspace_type 'talent') is the talent's sale, so
 * the owning party is the talent, not a workspace leg that the cross-platform
 * guard holds. A real agency / business workspace keeps the workspace as owner.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  isTalentOwnWorkspace,
  resolveOwningPartiesForTalents,
  resolveOwningPartyForTalent,
} from "./owning-party-resolver";

type Embed = { id: string; plan_tier: string | null; workspace_type: string | null };

function sbWith(tenantId: string, workspaceType: string | null) {
  const rows = [
    {
      tenant_id: tenantId,
      talent_profile_id: "t1",
      is_primary: true,
      status: "active",
      exclusivity_status: null,
      agencies: { id: tenantId, plan_tier: "free", workspace_type: workspaceType } as Embed,
    },
  ];
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
  };
  return { from: () => builder } as unknown as Parameters<typeof resolveOwningPartyForTalent>[0];
}

test("a sale in the talent's own workspace is owned by the talent (single)", async () => {
  assert.deepEqual(await resolveOwningPartyForTalent(sbWith("ws-own", "talent"), "t1", "ws-own"), { type: "talent", id: "t1" });
});

test("a sale in the talent's own workspace is owned by the talent (batch)", async () => {
  const out = await resolveOwningPartiesForTalents(sbWith("ws-own", "talent"), ["t1"], "ws-own");
  assert.deepEqual(out.get("t1"), { type: "talent", id: "t1" });
});

test("a real business workspace still owns the sale", async () => {
  assert.deepEqual(await resolveOwningPartyForTalent(sbWith("ws-biz", "agency"), "t1", "ws-biz"), { type: "workspace", id: "ws-biz" });
  assert.deepEqual(await resolveOwningPartyForTalent(sbWith("ws-biz", null), "t1", "ws-biz"), { type: "workspace", id: "ws-biz" });
  const out = await resolveOwningPartiesForTalents(sbWith("ws-biz", "agency"), ["t1"], "ws-biz");
  assert.deepEqual(out.get("t1"), { type: "workspace", id: "ws-biz" });
});

test("isTalentOwnWorkspace reads both embed shapes", () => {
  assert.equal(isTalentOwnWorkspace({ plan_tier: null, workspace_type: "talent" }), true);
  assert.equal(isTalentOwnWorkspace([{ plan_tier: null, workspace_type: "talent" }]), true);
  assert.equal(isTalentOwnWorkspace({ plan_tier: null, workspace_type: "agency" }), false);
  assert.equal(isTalentOwnWorkspace(null), false);
});
