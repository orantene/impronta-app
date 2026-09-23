import test from "node:test";
import assert from "node:assert/strict";

import {
  TALENT_SITE_CAPABILITY_KEYS,
  buildTalentSiteCapabilities,
  talentPlanGrantsCapability,
  talentPlanGrantsSiteCapability,
  talentPlanRemovesPlatformBadge,
  type TalentSiteCapability,
} from "./talent-membership";

/**
 * PHASE 1 — the personal-website capability matrix.
 *
 * The switch is read at CALL time (not at import), so each block sets the env
 * var, exercises the readers, and restores it. That is also the guarantee the
 * flags-off parity rests on: nothing is captured in a module-level constant.
 */
function withFreeWebsite<T>(enabled: boolean, fn: () => T): T {
  const previous = process.env.TALENT_FREE_WEBSITE_ENABLED;
  if (enabled) process.env.TALENT_FREE_WEBSITE_ENABLED = "true";
  else delete process.env.TALENT_FREE_WEBSITE_ENABLED;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.TALENT_FREE_WEBSITE_ENABLED;
    else process.env.TALENT_FREE_WEBSITE_ENABLED = previous;
  }
}

test("switch OFF: every site capability is Max-only, on every plan", () => {
  withFreeWebsite(false, () => {
    for (const key of TALENT_SITE_CAPABILITY_KEYS) {
      assert.equal(
        talentPlanGrantsSiteCapability("talent_basic", key),
        false,
        `free must not hold ${key} while the switch is off`,
      );
      assert.equal(
        talentPlanGrantsSiteCapability("talent_pro", key),
        false,
        `pro must not hold ${key} while the switch is off`,
      );
      assert.equal(
        talentPlanGrantsSiteCapability("talent_portfolio", key),
        true,
        `max must hold ${key} while the switch is off`,
      );
    }
    // An unknown / missing plan normalizes to Free, i.e. nothing.
    assert.equal(talentPlanGrantsSiteCapability(null, "personalSitePublish"), false);
    assert.equal(talentPlanGrantsSiteCapability("nonsense", "personalSiteEdit"), false);
  });
});

test("switch ON: Free holds edit, publish and design presets, nothing paid", () => {
  withFreeWebsite(true, () => {
    const free = buildTalentSiteCapabilities("talent_basic");
    assert.deepEqual(free, {
      personalSiteEdit: true,
      personalSitePublish: true,
      personalSiteDesignPresets: true,
      personalSiteSections: false,
      personalSitePages: false,
      personalSiteSeo: false,
      personalSiteAnalytics: false,
      personalSiteCustomDomain: false,
    });
  });
});

test("switch ON: Web Office holds every site capability", () => {
  withFreeWebsite(true, () => {
    const max = buildTalentSiteCapabilities("talent_portfolio");
    for (const key of TALENT_SITE_CAPABILITY_KEYS) {
      assert.equal(max[key], true, `Web Office must hold ${key}`);
    }
  });
});

test("switch ON: a grandfathered talent_pro gets the FREE website, not Web Office", () => {
  withFreeWebsite(true, () => {
    const pro = buildTalentSiteCapabilities("talent_pro");
    // Pro folds into Web Office: existing subscribers keep their profile perks
    // (profile.enhanced, embeds, press, media kit — asserted below) and the free
    // website, but the paid SITE features are Web Office only.
    assert.equal(pro.personalSiteEdit, true);
    assert.equal(pro.personalSitePublish, true);
    assert.equal(pro.personalSiteDesignPresets, true);
    assert.equal(pro.personalSiteSections, false);
    assert.equal(pro.personalSitePages, false);
    assert.equal(pro.personalSiteSeo, false);
    assert.equal(pro.personalSiteAnalytics, false);
    assert.equal(pro.personalSiteCustomDomain, false);

    // Grandfathered PROFILE perks are untouched by the site capability split.
    assert.equal(talentPlanGrantsCapability("talent_pro", "profile.enhanced"), true);
    assert.equal(talentPlanGrantsCapability("talent_pro", "personalSiteTemplate"), true);
    // ...and Pro still removes the platform badge, as marketed.
    assert.equal(talentPlanRemovesPlatformBadge("talent_pro"), true);
    assert.equal(talentPlanRemovesPlatformBadge("talent_basic"), false);
  });
});

test("personalSiteCustomBuilder is a deprecated ALIAS of personalSiteSections", () => {
  for (const enabled of [false, true]) {
    withFreeWebsite(enabled, () => {
      for (const plan of ["talent_basic", "talent_pro", "talent_portfolio"]) {
        assert.equal(
          talentPlanGrantsCapability(plan, "personalSiteCustomBuilder"),
          talentPlanGrantsCapability(plan, "personalSiteSections"),
          `alias must track personalSiteSections for ${plan} (switch ${enabled})`,
        );
      }
    });
  }
});

test("the general reader leaves the /t/[code] profile path alone", () => {
  // `personalSiteEdit` / `personalSitePublish` are ALSO read by the discovery
  // profile actions, where Free talents legitimately edit and publish. The
  // free-website switch must never close that door — only the SITE reader does.
  withFreeWebsite(false, () => {
    assert.equal(talentPlanGrantsCapability("talent_basic", "personalSiteEdit"), true);
    assert.equal(talentPlanGrantsCapability("talent_basic", "personalSitePublish"), true);
    assert.equal(talentPlanGrantsSiteCapability("talent_basic", "personalSiteEdit"), false);
  });
});

test("buildTalentSiteCapabilities covers exactly the declared key set", () => {
  withFreeWebsite(true, () => {
    const record = buildTalentSiteCapabilities("talent_portfolio");
    assert.deepEqual(
      Object.keys(record).sort(),
      [...TALENT_SITE_CAPABILITY_KEYS].sort(),
      "the record must have one entry per declared capability, no more, no less",
    );
    for (const key of Object.keys(record) as TalentSiteCapability[]) {
      assert.equal(typeof record[key], "boolean");
    }
  });
});
