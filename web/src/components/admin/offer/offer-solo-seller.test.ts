import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSoloSeller } from "./offer-solo-seller";

const base = { workspaceType: "talent", ownTalentProfileId: "t1", lineTalentProfileIds: ["t1", null] };

describe("isSoloSeller", () => {
  it("true for a talent workspace with only her own lines", () => {
    assert.equal(isSoloSeller(base), true);
  });
  it("false when another talent is on a line", () => {
    assert.equal(isSoloSeller({ ...base, lineTalentProfileIds: ["t1", "t2"] }), false);
  });
  it("false for an agency workspace", () => {
    assert.equal(isSoloSeller({ ...base, workspaceType: "agency" }), false);
  });
  it("false without an own talent profile", () => {
    assert.equal(isSoloSeller({ ...base, ownTalentProfileId: null }), false);
  });
});
