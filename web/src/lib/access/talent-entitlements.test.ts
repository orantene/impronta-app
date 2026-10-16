import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  entitlementsForPlan,
  hasEntitlement,
  normalizeEntitlementPlanKey,
  TALENT_ENTITLEMENTS,
} from "./talent-entitlements";
import {
  isTalentPortfolioTier,
  talentPlanGrantsCapability,
  talentPlanGrantsSiteCapability,
  talentPlanRemovesPlatformBadge,
} from "./talent-membership";
import { bookingAssistantPlanBand } from "@/lib/ai/booking-assistant/credits";
import { appointmentsTierForTalentPlan } from "@/lib/scheduling/talent-booking-mode";

const ENV_KEYS = ["TALENT_FREE_WEBSITE_ENABLED", "TALENT_SITE_TIER_EXPANSION_DISABLED"] as const;
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("TUL-837 talent entitlements", () => {
  it("normalizes legacy aliases and unknowns", () => {
    assert.equal(normalizeEntitlementPlanKey("pro"), "talent_pro");
    assert.equal(normalizeEntitlementPlanKey("max"), "talent_portfolio");
    assert.equal(normalizeEntitlementPlanKey(" talent_pro "), "talent_pro");
    assert.equal(normalizeEntitlementPlanKey(null), "talent_basic");
    assert.equal(normalizeEntitlementPlanKey("enterprise"), "talent_basic");
  });

  it("paid plans are supersets: basic subset of pro subset of portfolio (except none)", () => {
    for (const f of TALENT_ENTITLEMENTS.talent_basic) {
      assert.ok(TALENT_ENTITLEMENTS.talent_portfolio.has(f), f);
    }
    for (const f of TALENT_ENTITLEMENTS.talent_pro) {
      assert.ok(TALENT_ENTITLEMENTS.talent_portfolio.has(f), f);
    }
  });

  it("unlocks instantly: the answer follows the plan passed in, no cache", () => {
    assert.equal(hasEntitlement("talent_basic", "profile.noPlatformBadge"), false);
    assert.equal(hasEntitlement("talent_pro", "profile.noPlatformBadge"), true);
    assert.equal(hasEntitlement("talent_basic", "profile.noPlatformBadge"), false);
  });

  it("keeps the pre-consolidation answers of the legacy readers", () => {
    for (const plan of ["talent_basic", "talent_pro", "talent_portfolio", "pro", "max", null]) {
      assert.equal(talentPlanRemovesPlatformBadge(plan), hasEntitlement(plan, "profile.noPlatformBadge"));
      assert.equal(isTalentPortfolioTier(plan), hasEntitlement(plan, "profile.pageSeo"));
    }
    assert.equal(bookingAssistantPlanBand("talent_pro"), "paid");
    assert.equal(bookingAssistantPlanBand("talent_basic"), "free");
    assert.equal(appointmentsTierForTalentPlan("talent_portfolio"), "website");
    assert.equal(appointmentsTierForTalentPlan("talent_pro"), "free");
  });

  it("site scope is Max-only while the free website is dark", () => {
    delete process.env.TALENT_FREE_WEBSITE_ENABLED;
    assert.equal(talentPlanGrantsSiteCapability("talent_basic", "personalSiteEdit"), false);
    assert.equal(talentPlanGrantsSiteCapability("talent_portfolio", "personalSiteEdit"), true);
    process.env.TALENT_FREE_WEBSITE_ENABLED = "true";
    assert.equal(hasEntitlement("talent_basic", "personalSiteEdit", "site"), true);
    assert.equal(hasEntitlement("talent_basic", "personalSitePages", "site"), false);
    assert.equal(hasEntitlement("talent_portfolio", "personalSitePages", "site"), true);
  });

  it("general scope delegates through talentPlanGrantsCapability", () => {
    process.env.TALENT_FREE_WEBSITE_ENABLED = "true";
    delete process.env.TALENT_SITE_TIER_EXPANSION_DISABLED;
    assert.equal(talentPlanGrantsCapability("talent_pro", "personalSiteTemplate"), true);
    assert.equal(talentPlanGrantsCapability("talent_basic", "personalSiteTemplate"), false);
    assert.equal(talentPlanGrantsCapability("talent_pro", "personalSiteCustomBuilder"), false);
    assert.ok(entitlementsForPlan("talent_portfolio").includes("discover.priority"));
  });

  it("no feature gate compares plan keys outside the map (static guard)", () => {
    const root = path.resolve(__dirname, "../..");
    const files = [
      "lib/ai/booking-assistant/credits.ts",
      "lib/scheduling/talent-booking-mode.ts",
      "lib/talent-site/contact-channels.ts",
      "lib/talent-site/server/load-max-site-link.ts",
      "lib/talent-site/talent-page-seo.ts",
      "lib/directory/fetch-directory-page.ts",
    ];
    for (const f of files) {
      const src = readFileSync(path.join(root, f), "utf8");
      assert.doesNotMatch(src, /[!=]==\s*"talent_(pro|portfolio)"/, f);
    }
  });
});
