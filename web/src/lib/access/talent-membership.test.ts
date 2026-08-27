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

test("all tiers can edit and publish personal sites when tier expansion is on", () => {
  for (const planKey of ["talent_basic", "talent_pro", "talent_portfolio"]) {
    assert.equal(talentPlanGrantsCapability(planKey, "personalSiteEdit"), true);
    assert.equal(talentPlanGrantsCapability(planKey, "personalSitePublish"), true);
  }
});

test("template gallery is Pro+; custom builder is Max only", () => {
  assert.equal(talentPlanGrantsCapability("talent_basic", "personalSiteTemplate"), false);
  assert.equal(talentPlanGrantsCapability("talent_pro", "personalSiteTemplate"), true);
  assert.equal(talentPlanGrantsCapability("talent_portfolio", "personalSiteTemplate"), true);

  assert.equal(talentPlanGrantsCapability("talent_basic", "personalSiteCustomBuilder"), false);
  assert.equal(talentPlanGrantsCapability("talent_pro", "personalSiteCustomBuilder"), false);
  assert.equal(talentPlanGrantsCapability("talent_portfolio", "personalSiteCustomBuilder"), true);
});

test("reserved access capability keys resolve through the talent plan map", () => {
  assert.equal(talentPlanGrantsAccessCapability("talent_basic", "talent.page.edit"), true);
  assert.equal(talentPlanGrantsAccessCapability("talent_pro", "talent.page.publish"), true);
  assert.equal(talentPlanGrantsAccessCapability("talent_basic", "talent.page.set_template"), false);
  assert.equal(talentPlanGrantsAccessCapability("talent_pro", "talent.page.set_template"), true);
  assert.equal(talentPlanGrantsAccessCapability("talent_portfolio", "talent.page.enable_module"), true);
  // Custom domain is a Max-only capability — granted to talent_portfolio, denied
  // to free/pro.
  assert.equal(
    talentPlanGrantsAccessCapability("talent_portfolio", "talent.page.connect_custom_domain"),
    true,
  );
  assert.equal(
    talentPlanGrantsAccessCapability("talent_basic", "talent.page.connect_custom_domain"),
    false,
  );
  assert.equal(
    talentPlanGrantsAccessCapability("talent_pro", "talent.page.connect_custom_domain"),
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
      canEditPersonalSite: true,
      canPublishPersonalSite: true,
      canUseTemplateGallery: false,
      canUseCustomBuilder: false,
      canSetPersonalSiteTemplate: false,
      canConnectPersonalSiteDomain: false,
    },
  });

  assert.deepEqual(buildTalentMembershipState("talent_pro"), {
    planKey: "talent_pro",
    tier: "pro",
    displayName: "Pro",
    capabilities: {
      canBuildPersonalSite: false,
      canEditPersonalSite: true,
      canPublishPersonalSite: true,
      canUseTemplateGallery: true,
      canUseCustomBuilder: false,
      canSetPersonalSiteTemplate: true,
      canConnectPersonalSiteDomain: false,
    },
  });

  assert.deepEqual(buildTalentMembershipState("talent_portfolio"), {
    planKey: "talent_portfolio",
    tier: "max",
    displayName: "Portfolio",
    capabilities: {
      canBuildPersonalSite: true,
      canEditPersonalSite: true,
      canPublishPersonalSite: true,
      canUseTemplateGallery: true,
      canUseCustomBuilder: true,
      canSetPersonalSiteTemplate: true,
      canConnectPersonalSiteDomain: true,
    },
  });
});
