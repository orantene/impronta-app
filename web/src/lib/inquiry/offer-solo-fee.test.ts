import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveSoloSafeCoordinatorFee, soloSafeCoordinatorFee } from "./offer-solo-fee";

const solo = {
  requestedFee: 150,
  workspaceType: "talent",
  ownTalentProfileIds: ["me"],
  lineTalentProfileIds: ["me", null],
};

describe("TUL-380 follow-up: a solo owner-talent's offer carries workspace fee 0", () => {
  it("drops an older draft's fee for a solo seller", () => {
    assert.equal(soloSafeCoordinatorFee(solo), 0);
  });

  it("keeps the fee when another talent is on a line", () => {
    assert.equal(soloSafeCoordinatorFee({ ...solo, lineTalentProfileIds: ["me", "other"] }), 150);
  });

  it("keeps the fee in agency and hub workspaces", () => {
    assert.equal(soloSafeCoordinatorFee({ ...solo, workspaceType: "agency" }), 150);
    assert.equal(soloSafeCoordinatorFee({ ...solo, workspaceType: null }), 150);
  });

  it("keeps the fee when the actor has no talent profile (staff in a talent workspace)", () => {
    assert.equal(soloSafeCoordinatorFee({ ...solo, ownTalentProfileIds: [] }), 150);
  });

  it("matches any of the actor's profiles", () => {
    assert.equal(soloSafeCoordinatorFee({ ...solo, ownTalentProfileIds: ["old", "me"] }), 0);
  });

  it("reads workspace type and the actor's profiles before deciding", async () => {
    const reads: string[] = [];
    const fake = {
      from(table: string) {
        reads.push(table);
        const rows = table === "agencies" ? { workspace_type: "talent" } : [{ id: "me" }];
        const chain = {
          select: () => chain,
          eq: () => (table === "agencies" ? chain : Promise.resolve({ data: rows, error: null })),
          maybeSingle: () => Promise.resolve({ data: rows, error: null }),
        };
        return chain;
      },
    };
    const fee = await resolveSoloSafeCoordinatorFee(fake as never, {
      tenantId: "t1",
      actorUserId: "u1",
      requestedFee: 150,
      lineTalentProfileIds: ["me"],
    });
    assert.equal(fee, 0);
    assert.deepEqual(reads.sort(), ["agencies", "talent_profiles"]);
  });

  it("skips the lookup when there is no fee to drop", async () => {
    const fee = await resolveSoloSafeCoordinatorFee({ from: () => assert.fail("no read") } as never, {
      tenantId: "t1",
      actorUserId: "u1",
      requestedFee: 0,
      lineTalentProfileIds: ["me"],
    });
    assert.equal(fee, 0);
  });

  it("updateOfferDraft writes the solo-safe fee, not the caller's", () => {
    const src = readFileSync("src/lib/inquiry/inquiry-engine-offers.ts", "utf8");
    assert.match(src, /resolveSoloSafeCoordinatorFee\(supabase,/);
    assert.match(src, /coordinator_fee: coordinatorFee,/);
    assert.doesNotMatch(src, /coordinator_fee: ctx\.coordinator_fee/);
  });
});
