import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { activationFromRow } from "./site-activation-core";
import { websiteFlowState } from "../../talent/website-flow";

const ACTIVATION_SRC = readFileSync(
  join(process.cwd(), "src/lib/talent-site/server/site-activation-state.ts"),
  "utf8",
);

const NUDGE_SRC = readFileSync(
  join(process.cwd(), "src/components/talent/site/TalentSiteActivateNudge.tsx"),
  "utf8",
);

// The entire reason this module exists separately from
// `loadMaxSiteManagerAction` is that the manager PROVISIONS the site as a side
// effect of loading it. This one runs on every Today render, so provisioning
// here would mint a talent_sites row + site_slug for every talent who merely
// opened their dashboard. Keep it read-only.
test("the activation-state action never provisions a site", () => {
  assert.equal(ACTIVATION_SRC.includes("provisionTalentMaxSite"), false);
  assert.equal(ACTIVATION_SRC.includes("ensureMaxSite"), false);
  assert.equal(ACTIVATION_SRC.includes(".insert("), false);
  assert.equal(ACTIVATION_SRC.includes(".upsert("), false);
  assert.equal(ACTIVATION_SRC.includes(".update("), false);
});

test("the activation-state action is owner-gated and capability-gated", () => {
  assert.match(ACTIVATION_SRC, /requireTalentSelf\(\)/);
  assert.match(ACTIVATION_SRC, /activationFromRow\(data as ActivationRow, capabilities\)/);
});

// A row whose site_slug is NULL is not a usable site: every pre-existing
// production row looks like that and none of them serves anything. Treating
// one as "has a site" would send the talent to a dead address.
test("a NULL site_slug does not count as having a site", () => {
  const st = activationFromRow(
    { site_slug: null, site_published_at: "2026-09-30T00:00:00Z", theme_design_slug: null, theme_look_slug: null },
    { personalSiteEdit: true, personalSiteDesignPresets: true },
  );
  assert.equal(st.hasSite, false);
  assert.equal(st.isPublished, false);
});

// F53: Valeria TAL-93901 after "Use this design" on Maison v2, flag-off build
// (personalSiteEdit Max-only). Must read as an applied design => preview.
test("F53: applied maison-v2, unpublished, free plan with edit gated off => preview", () => {
  const row = {
    site_slug: "valeria-unas",
    site_published_at: null,
    theme_design_slug: "maison-v2",
    theme_look_slug: null,
  };
  const st = activationFromRow(row, { personalSiteEdit: false, personalSiteDesignPresets: true });
  assert.equal(st.canManage, true);
  assert.equal(st.themeDesignSlug, "maison-v2");
  assert.equal(st.themeLookSlug, null);
  assert.equal(st.isPublished, false);
  assert.equal(
    websiteFlowState({ percent: 100, isPublished: st.isPublished, themeDesignSlug: st.themeDesignSlug }),
    "preview",
  );
  // Even with every site capability off, a set design is still applied.
  const off = activationFromRow(row, { personalSiteEdit: false, personalSiteDesignPresets: false });
  assert.equal(off.canManage, true);
  assert.equal(off.themeDesignSlug, "maison-v2");
});

test("the Today nudge hides itself unless the site is unpublished", () => {
  assert.match(NUDGE_SRC, /s\.canManage && !s\.isPublished/);
  assert.match(NUDGE_SRC, /if \(!show \|\| dismissed\) return null;/);
});

test("the Today nudge requires website eligibility unlocked (W22)", () => {
  assert.match(NUDGE_SRC, /eligibility\.unlocked/);
  assert.match(NUDGE_SRC, /Your free website is unlocked/);
});

test("activation state exposes siteSlug for suggested address", () => {
  const flags = { personalSiteEdit: true, personalSiteDesignPresets: true };
  assert.equal(activationFromRow({ site_slug: "valeria-unas" }, flags).siteSlug, "valeria-unas");
  assert.equal(activationFromRow(null, flags).siteSlug, null);
});
