import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
  assert.match(ACTIVATION_SRC, /capabilities\.personalSiteEdit/);
});

// A row whose site_slug is NULL is not a usable site: every pre-existing
// production row looks like that and none of them serves anything. Treating
// one as "has a site" would send the talent to a dead address.
test("a NULL site_slug does not count as having a site", () => {
  assert.match(ACTIVATION_SRC, /const hasSite = Boolean\(slug\)/);
  assert.match(ACTIVATION_SRC, /isPublished = hasSite && Boolean\(/);
});

test("the Today nudge hides itself unless the site is unpublished", () => {
  assert.match(NUDGE_SRC, /s\.canManage && !s\.isPublished/);
  assert.match(NUDGE_SRC, /if \(!show \|\| dismissed\) return null;/);
});
