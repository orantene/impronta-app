import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { isSoloTalentWorkspace, showAgencyUpsell } from "./agency-upsell";

describe("TUL-734: Clients Agency upsell for solo talent", () => {
  it("solo = roster of one on a talent workspace with no studio or agency plan", () => {
    assert.equal(isSoloTalentWorkspace({ rosterCount: 1, workspaceType: "talent", plan: "free" }), true);
    assert.equal(isSoloTalentWorkspace({ rosterCount: 1, workspaceType: "talent", plan: "website" }), true);
  });

  it("a roster of more than one, or none, is not solo", () => {
    assert.equal(isSoloTalentWorkspace({ rosterCount: 2, workspaceType: "talent", plan: "free" }), false);
    assert.equal(isSoloTalentWorkspace({ rosterCount: 0, workspaceType: "talent", plan: "free" }), false);
  });

  it("a studio, agency or network plan is an agency posture even with one talent", () => {
    for (const plan of ["studio", "agency", "network"] as const) {
      assert.equal(isSoloTalentWorkspace({ rosterCount: 1, workspaceType: "talent", plan }), false);
    }
  });

  it("a business workspace is never solo talent", () => {
    assert.equal(isSoloTalentWorkspace({ rosterCount: 1, workspaceType: "business", plan: "free" }), false);
  });

  it("solo talent never sees the upsell, on any plan", () => {
    for (const plan of ["free", "website", "studio", "agency", "network"] as const) {
      assert.equal(showAgencyUpsell({ plan, soloTalent: true }), false);
    }
  });

  it("agency or business workspaces below the agency tier keep the locked upsell", () => {
    for (const plan of ["free", "website", "studio"] as const) {
      assert.equal(showAgencyUpsell({ plan, soloTalent: false }), true);
    }
  });

  it("workspaces that already have the capability see no lock", () => {
    for (const plan of ["agency", "network"] as const) {
      assert.equal(showAgencyUpsell({ plan, soloTalent: false }), false);
    }
  });

  it("ClientsPage gates both upsell blocks with the helper", () => {
    const src = readFileSync("src/components/admin/shell/internal/page-modules/ClientsPage.tsx", "utf8");
    assert.match(src, /showAgencyUpsell\(/);
    assert.match(src, /isSoloTalentWorkspace\(/);
    assert.match(src, /\{agencyUpsell \? \(/);
    assert.match(src, /\{state\.plan === "studio" && agencyUpsell && \(/);
  });
});
