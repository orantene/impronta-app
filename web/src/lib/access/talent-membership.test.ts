import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTalentMembershipState,
  normalizeTalentPlanKey,
  talentPlanGrantsAccessCapability,
  talentPlanGrantsCapability,
  talentPlanToTier,
  talentTierToPlanKey,
} from "@/lib/access/talent-membership";

test("talent membership normalizes stored plan keys and legacy tier labels", () => {
  assert.equal(normalizeTalentPlanKey(null), "talent_basic");
  assert.equal(normalizeTalentPlanKey("talent_basic"), "talent_basic");
  assert.equal(normalizeTalentPlanKey("talent_pro"), "talent_pro");
  assert.equal(normalizeTalentPlanKey("talent_portfolio"), "talent_portfolio");
  assert.equal(normalizeTalentPlanKey("free"), "talent_basic");
  assert.equal(normalizeTalentPlanKey("pro"), "talent_pro");
  assert.equal(normalizeTalentPlanKey("max"), "talent_portfolio");
  assert.equal(normalizeTalentPlanKey("studio"), "talent_basic");
});

test("talent membership maps product plan keys to dashboard tiers", () => {
  assert.equal(talentPlanToTier("talent_basic"), "free");
  assert.equal(talentPlanToTier("talent_pro"), "pro");
  assert.equal(talentPlanToTier("talent_portfolio"), "max");
  assert.equal(talentTierToPlanKey("max"), "talent_portfolio");
});

test("only Talent Max can build, edit, and publish a personal site", () => {
  for (const planKey of ["talent_basic", "talent_pro"]) {
    assert.equal(talentPlanGrantsCapability(planKey, "personalSiteBuilder"), false);
    assert.equal(talentPlanGrantsCapability(planKey, "personalSiteEdit"), false);
    assert.equal(talentPlanGrantsCapability(planKey, "personalSitePublish"), false);
  }

  assert.equal(talentPlanGrantsCapability("talent_portfolio", "personalSiteBuilder"), true);
  assert.equal(talentPlanGrantsCapability("talent_portfolio", "personalSiteEdit"), true);
  assert.equal(talentPlanGrantsCapability("talent_portfolio", "personalSitePublish"), true);
});

test("reserved access capability keys resolve through the talent plan map", () => {
  assert.equal(talentPlanGrantsAccessCapability("talent_basic", "talent.page.edit"), false);
  assert.equal(talentPlanGrantsAccessCapability("talent_pro", "talent.page.publish"), false);
  assert.equal(talentPlanGrantsAccessCapability("talent_portfolio", "talent.page.edit"), true);
  assert.equal(talentPlanGrantsAccessCapability("talent_portfolio", "talent.page.publish"), true);
  assert.equal(
    talentPlanGrantsAccessCapability("talent_portfolio", "talent.page.connect_custom_domain"),
    false,
  );
});

test("membership state exposes UI-safe capability booleans", () => {
  assert.deepEqual(buildTalentMembershipState("talent_basic"), {
    planKey: "talent_basic",
    tier: "free",
    displayName: "Free",
    capabilities: {
      canBuildPersonalSite: false,
      canEditPersonalSite: false,
      canPublishPersonalSite: false,
      canSetPersonalSiteTemplate: false,
      canConnectPersonalSiteDomain: false,
    },
  });

  assert.deepEqual(buildTalentMembershipState("talent_portfolio"), {
    planKey: "talent_portfolio",
    tier: "max",
    displayName: "Max",
    capabilities: {
      canBuildPersonalSite: true,
      canEditPersonalSite: true,
      canPublishPersonalSite: true,
      canSetPersonalSiteTemplate: true,
      canConnectPersonalSiteDomain: false,
    },
  });
});
