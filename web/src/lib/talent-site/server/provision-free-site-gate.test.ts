import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { talentPlanGrantsSiteCapability } from "@/lib/access/talent-membership";

/**
 * Phase 1 says a FREE talent gets a website. Provisioning used to disagree:
 *
 *   if (profile.talent_plan_key !== "talent_portfolio") {
 *     return { ok: false, error: "Talent Portfolio plan required." };
 *   }
 *
 * Every READ-time gate had already moved onto the capability matrix, which
 * grants `talent_basic` both personalSiteEdit and personalSitePublish. Only the
 * CREATE path still hard-coded the tier, so a free talent could be offered a
 * site that could never be provisioned — and because nothing was ever created,
 * nothing downstream of it ever ran either.
 *
 * The literal is pinned out of the source rather than only asserting the
 * behaviour, because the failure mode is someone reintroducing the tier check
 * "to be safe" and silently closing free-site creation again.
 */

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "provision-max-site.ts"), "utf8");

test("provisioning asks the capability matrix, not a hard-coded tier", () => {
  assert.doesNotMatch(
    source,
    /talent_plan_key\s*!==\s*"talent_portfolio"/,
    "provisioning hard-codes the Max tier again — free-site creation is closed",
  );
  assert.match(
    source,
    /talentPlanGrantsSiteCapability\(\s*profile\.talent_plan_key,\s*"personalSiteEdit"\s*\)/,
    "provisioning no longer reads the site capability matrix",
  );
});

test("with the free website ON, a free talent may have a site provisioned", () => {
  const prev = process.env.TALENT_FREE_WEBSITE_ENABLED;
  process.env.TALENT_FREE_WEBSITE_ENABLED = "true";
  try {
    assert.equal(talentPlanGrantsSiteCapability("talent_basic", "personalSiteEdit"), true);
    assert.equal(talentPlanGrantsSiteCapability("talent_portfolio", "personalSiteEdit"), true);
  } finally {
    if (prev === undefined) delete process.env.TALENT_FREE_WEBSITE_ENABLED;
    else process.env.TALENT_FREE_WEBSITE_ENABLED = prev;
  }
});

test("with the switch OFF, provisioning is Max-only exactly as the literal was", () => {
  // The dark-build contract: this change must be invisible until the switch is
  // on, or it is not a dark launch.
  const prev = process.env.TALENT_FREE_WEBSITE_ENABLED;
  delete process.env.TALENT_FREE_WEBSITE_ENABLED;
  try {
    assert.equal(talentPlanGrantsSiteCapability("talent_basic", "personalSiteEdit"), false);
    assert.equal(talentPlanGrantsSiteCapability("talent_pro", "personalSiteEdit"), false);
    assert.equal(talentPlanGrantsSiteCapability("talent_portfolio", "personalSiteEdit"), true);
  } finally {
    if (prev !== undefined) process.env.TALENT_FREE_WEBSITE_ENABLED = prev;
  }
});
