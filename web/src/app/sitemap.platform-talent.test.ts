import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SITEMAP_SRC = readFileSync(join(process.cwd(), "src/app/sitemap.ts"), "utf8");

/**
 * The platform talent branch emits `/t/<code>` — the PROFILE page — so it must
 * gate on the profile's own public listing, not on a separate object.
 *
 * It previously sourced from `talent_sites` gated on `status = "published"`,
 * the talent's opt-in MICROSITE. Measured on production 2026-09-05: 5 microsite
 * rows, 0 published, 79 profiles passing the public gate, and therefore ZERO
 * talent URLs in sitemap.xml while 79 profile pages served HTTP 200. The URL and
 * the gate described different objects.
 *
 * These assertions pin the SHAPE that keeps them the same object: the source is
 * `talent_profiles`, and the predicates are the canonical public-listing gate
 * that `fetch-directory-page.ts` uses for the directory listing itself. If the
 * directory shows a card, the sitemap should advertise it.
 */
test("platform sitemap branch reads publicly listed talent PROFILES", () => {
  assert.match(SITEMAP_SRC, /isTalentProfilePlatformHost/);
  assert.match(SITEMAP_SRC, /createServiceRoleClient/);
  assert.match(SITEMAP_SRC, /from\("talent_profiles"\)/);

  // The canonical public gate, mirroring the directory's listing query.
  assert.match(SITEMAP_SRC, /\.is\("deleted_at", null\)/);
  assert.match(SITEMAP_SRC, /\.eq\("is_publicly_hidden", false\)/);
  assert.match(SITEMAP_SRC, /\.eq\("is_publicly_listed", true\)/);
  assert.match(SITEMAP_SRC, /\.eq\("visibility", "public"\)/);
  assert.match(SITEMAP_SRC, /\.neq\("profile_kind", "resource"\)/);
  // A row with no code cannot produce a URL; never emit /t/undefined.
  assert.match(SITEMAP_SRC, /\.not\("profile_code", "is", null\)/);

  assert.match(SITEMAP_SRC, /\.limit\(5000\)/);
  assert.match(SITEMAP_SRC, /https:\/\/\$\{TULALA_APEX_HOST\}/);
  assert.match(SITEMAP_SRC, /withLocalePath\(`\/t\/\$\{code\}`, "es"\)/);
});

test("the sitemap does NOT gate profile URLs on the microsite table", () => {
  // The regression this branch is guarding against, stated as its own test so a
  // future refactor cannot quietly reintroduce it: gating `/t/<code>` on
  // `talent_sites` hid 79 live pages behind 0 published microsites.
  const talentBranch = SITEMAP_SRC.slice(
    SITEMAP_SRC.indexOf("loadPlatformTalentSitemapEntries"),
    SITEMAP_SRC.indexOf("export default async function sitemap"),
  );
  assert.doesNotMatch(talentBranch, /from\("talent_sites"\)/);
  assert.doesNotMatch(talentBranch, /published_snapshot/);
});

test("platform talent branch returns before agency cms and roster paths", () => {
  const platformBranch = SITEMAP_SRC.indexOf("if (isTalentProfilePlatformHost(hostContext.kind))");
  const agencyGate = SITEMAP_SRC.indexOf('if (hostContext.kind !== "agency")');
  const cmsPages = SITEMAP_SRC.indexOf('rpc("cms_public_pages_for_tenant"');
  const agencyRoster = SITEMAP_SRC.indexOf('eq("created_by_agency_id", publicScope.tenantId)');

  assert.ok(platformBranch > 0);
  assert.ok(agencyGate > platformBranch);
  assert.ok(cmsPages > agencyGate);
  assert.ok(agencyRoster > agencyGate);
});

test("agency roster sitemap reads public roster rows with service role filters", () => {
  const rosterClient = SITEMAP_SRC.indexOf("const rosterClient = createServiceRoleClient() ?? supabase");
  const rosterQuery = SITEMAP_SRC.indexOf('.from("talent_profiles")', rosterClient);
  const agencyScope = SITEMAP_SRC.indexOf('.eq("created_by_agency_id", publicScope.tenantId)', rosterQuery);
  const publicVisibility = SITEMAP_SRC.indexOf('.eq("visibility", "public")', rosterQuery);
  const deletedFilter = SITEMAP_SRC.indexOf('.is("deleted_at", null)', rosterQuery);

  assert.ok(rosterClient > 0);
  assert.ok(rosterQuery > rosterClient);
  assert.ok(agencyScope > rosterQuery);
  assert.ok(publicVisibility > rosterQuery);
  assert.ok(deletedFilter > rosterQuery);
});
