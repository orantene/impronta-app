import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { isSoloOwnerThread, isSoloSeller } from "./offer-solo-seller";

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

describe("isSoloOwnerThread", () => {
  it("true in a talent workspace when she is the only talent", () => {
    assert.equal(isSoloOwnerThread({ workspaceType: "talent", lineupTotal: 1 }), true);
    assert.equal(isSoloOwnerThread({ workspaceType: "talent", lineupTotal: 0 }), true);
  });
  it("false with two or more talents", () => {
    assert.equal(isSoloOwnerThread({ workspaceType: "talent", lineupTotal: 2 }), false);
  });
  it("false while the lineup count is unknown", () => {
    assert.equal(isSoloOwnerThread({ workspaceType: "talent", lineupTotal: undefined }), false);
  });
  it("false outside a talent workspace", () => {
    assert.equal(isSoloOwnerThread({ workspaceType: "agency", lineupTotal: 1 }), false);
    assert.equal(isSoloOwnerThread({ workspaceType: "hub", lineupTotal: 1 }), false);
  });
});

describe("TUL-380 follow-up wiring", () => {
  const read = (rel: string) => readFileSync(join(__dirname, rel), "utf8");
  const thread = read("../shell/internal/messages/talent-2.tsx");
  const header = read("../shell/internal/messages/talent-1.tsx");
  const line = read("../shell/internal/messages/shared/offer-draft-line-item.tsx");
  const split = read("./offer-money-split.tsx");

  it("solo owner-talent hides the coordinating banner and the coord pill", () => {
    assert.match(thread, /isCoordinator && !soloOwner && \(/);
    assert.match(thread, /hideCoordPill=\{soloOwner\}/);
    assert.match(header, /conv\.iAmCoordinator && !hideCoordPill && \(/);
  });
  it("solo seller sees 'you get' instead of 'talent gets'", () => {
    assert.match(line, /solo\s*\?\s*t\("dashboard\.adminTabs\.lineup\.colYouGet"\)/);
    assert.match(split, /solo \? t\("dashboard\.adminTabs\.lineup\.colYouGet"\)/);
    assert.match(split, /hideWorkspaceTake\s*\?\s*t\("dashboard\.adminTabs\.lineup\.splitYouGet"\)/);
  });
  it("both locales carry the new labels", () => {
    for (const loc of ["es", "en"]) {
      const m = JSON.parse(readFileSync(join(__dirname, `../../../../messages/${loc}.json`), "utf8"));
      const lineup = m.dashboard.adminTabs.lineup;
      assert.equal(typeof lineup.colYouGet, "string", `${loc} colYouGet`);
      assert.equal(typeof lineup.splitYouGet, "string", `${loc} splitYouGet`);
    }
  });
});
