import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SITEMAP_SRC = readFileSync(join(process.cwd(), "src/app/sitemap.ts"), "utf8");

test("platform sitemap branch reads published talent_sites rows", () => {
  assert.match(SITEMAP_SRC, /isTalentProfilePlatformHost/);
  assert.match(SITEMAP_SRC, /createServiceRoleClient/);
  assert.match(SITEMAP_SRC, /from\("talent_sites"\)/);
  assert.match(SITEMAP_SRC, /talent_profiles!inner\(profile_code, visibility, deleted_at, is_publicly_hidden\)/);
  assert.match(SITEMAP_SRC, /\.eq\("status", "published"\)/);
  assert.match(SITEMAP_SRC, /\.not\("published_snapshot", "is", null\)/);
  assert.match(SITEMAP_SRC, /\.eq\("talent_profiles\.visibility", "public"\)/);
  assert.match(SITEMAP_SRC, /\.is\("talent_profiles\.deleted_at", null\)/);
  assert.match(SITEMAP_SRC, /\.eq\("talent_profiles\.is_publicly_hidden", false\)/);
  assert.match(SITEMAP_SRC, /\.limit\(5000\)/);
  assert.match(SITEMAP_SRC, /https:\/\/\$\{TULALA_APEX_HOST\}/);
  assert.match(SITEMAP_SRC, /withLocalePath\(`\/t\/\$\{code\}`, "es"\)/);
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
