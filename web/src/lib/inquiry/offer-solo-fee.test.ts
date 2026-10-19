import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveSoloSafeCoordinatorFee, soloSafeCoordinatorFee } from "./offer-solo-fee";

const solo = {
  requestedFee: 150,
  workspaceType: "talent",
  workspaceKind: "talent",
  actorIsOwner: true,
  ownTalentProfileIds: ["me"],
  lineTalentProfileIds: ["me", null],
};

describe("TUL-380 follow-up: a solo owner-talent's offer carries workspace fee 0", () => {
  it("drops an older draft's fee for a solo owner", () => {
    assert.equal(soloSafeCoordinatorFee(solo), 0);
  });

  it("keeps the fee when another talent is on a line", () => {
    assert.equal(soloSafeCoordinatorFee({ ...solo, lineTalentProfileIds: ["me", "other"] }), 150);
  });

  it("keeps the fee in agency and hub workspaces, whose workspace_type defaults to talent", () => {
    assert.equal(soloSafeCoordinatorFee({ ...solo, workspaceKind: "agency" }), 150);
    assert.equal(soloSafeCoordinatorFee({ ...solo, workspaceKind: "hub" }), 150);
    assert.equal(soloSafeCoordinatorFee({ ...solo, workspaceType: "business" }), 150);
  });

  it("keeps the fee for hybrid staff who are not the workspace owner", () => {
    assert.equal(soloSafeCoordinatorFee({ ...solo, actorIsOwner: false }), 150);
  });

  it("keeps the fee when the actor has no talent profile", () => {
    assert.equal(soloSafeCoordinatorFee({ ...solo, ownTalentProfileIds: [] }), 150);
  });

  it("matches any of the actor's profiles", () => {
    assert.equal(soloSafeCoordinatorFee({ ...solo, ownTalentProfileIds: ["old", "me"] }), 0);
  });

  function fakeDb(rows: { agencies?: unknown; agency_memberships?: unknown; talent_profiles?: unknown }, failing?: string) {
    const reads: string[] = [];
    const client = {
      from(table: string) {
        reads.push(table);
        const result = failing === table
          ? { data: null, error: { message: "boom" } }
          : { data: (rows as Record<string, unknown>)[table] ?? null, error: null };
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: () => Promise.resolve(result),
          then: (resolve: (v: unknown) => unknown) => resolve(result),
        };
        return chain;
      },
    };
    return { client, reads };
  }

  const soloRows = {
    agencies: { workspace_type: "talent", kind: "talent" },
    agency_memberships: { profile_id: "u1" },
    talent_profiles: [{ id: "me" }],
  };
  const ctx = { tenantId: "t1", actorUserId: "u1", requestedFee: 150, lineTalentProfileIds: ["me"] };

  it("reads the workspace, the owner seat and the actor's profiles before deciding", async () => {
    const { client, reads } = fakeDb(soloRows);
    assert.deepEqual(await resolveSoloSafeCoordinatorFee(client as never, ctx), { ok: true, fee: 0 });
    assert.deepEqual(reads.sort(), ["agencies", "agency_memberships", "talent_profiles"]);
  });

  it("keeps the fee for a non-owner even in a talent workspace", async () => {
    const { client } = fakeDb({ ...soloRows, agency_memberships: null });
    assert.deepEqual(await resolveSoloSafeCoordinatorFee(client as never, ctx), { ok: true, fee: 150 });
  });

  it("fails closed when any read fails", async () => {
    for (const table of ["agencies", "agency_memberships", "talent_profiles"]) {
      const { client } = fakeDb(soloRows, table);
      assert.deepEqual(await resolveSoloSafeCoordinatorFee(client as never, ctx), { ok: false }, table);
    }
  });

  it("skips the lookup when there is no fee to drop", async () => {
    const result = await resolveSoloSafeCoordinatorFee({ from: () => assert.fail("no read") } as never, {
      ...ctx,
      requestedFee: 0,
    });
    assert.deepEqual(result, { ok: true, fee: 0 });
  });

  it("updateOfferDraft resolves the fee before any write and refuses when it cannot", () => {
    const src = readFileSync("src/lib/inquiry/inquiry-engine-offers.ts", "utf8");
    const body = src.slice(src.indexOf("export async function updateOfferDraft"));
    const resolveAt = body.indexOf("resolveSoloSafeCoordinatorFee(supabase,");
    assert.ok(resolveAt > 0);
    assert.ok(resolveAt < body.indexOf(".delete()"), "fee is classified before line items are rewritten");
    assert.match(body, /if \(!soloFee\.ok\) return \{ success: false, error: "offer_fee_unresolved" \};/);
    assert.match(body, /coordinator_fee: coordinatorFee,/);
    assert.doesNotMatch(body, /coordinator_fee: ctx\.coordinator_fee/);
  });
});
