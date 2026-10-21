import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { directoryTenantIdForHost } from "./directory-scope";

const HUB = "00000000-0000-0000-0000-000000000002";
const AGENCY = "11111111-1111-4111-8111-111111111111";
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("a hub host scopes the directory to NO tenant, whatever the header says; an agency keeps its tenant", () => {
  assert.equal(directoryTenantIdForHost("hub", HUB), null);
  assert.equal(directoryTenantIdForHost("hub", null), null);
  assert.equal(directoryTenantIdForHost("agency", AGENCY), AGENCY);
  assert.equal(directoryTenantIdForHost("agency", null), null);
});

test("the list API and the server-rendered section agree on the hub rule", () => {
  const route = read("src/app/api/directory/route.ts");
  assert.match(route, /hostContext\.kind === "agency"\s*\?\s*hostContext\.tenantId[\s\S]*?: null/, "the list scopes only an agency (and an app path tenant); a hub is null");
  const section = read("src/lib/site-admin/sections/directory/Component.tsx");
  assert.match(section, /directoryTenantIdForHost\(hostContext\.kind, publicScope\?\.tenantId \?\? null\)/);
  assert.match(section, /directorySurfaceFromTenantId\(directoryTenantId\)/, "the facet surface follows the same id");
  assert.doesNotMatch(section, /directorySurfaceFromTenantId\(publicScope\?\.tenantId/, "no surface derived straight from the header any more");
});

test("branding (card design, map key) still follows the host's own tenant", () => {
  const section = read("src/lib/site-admin/sections/directory/Component.tsx");
  assert.match(section, /resolveGoogleMapsKeyForClient\(publicScope\?\.tenantId \?\? null\)/);
  assert.match(section, /publicScope\?\.tenantId\s*\?\s*await resolveCardDesign\(publicScope\.tenantId\)/);
});

test("the hub (no-tenant) facet overloads search through the list's function, signatures unchanged", () => {
  const sql = read("../supabase/migrations/_pending_pm/20261231425700_directory_facet_counts_hub_use_list_search_tul1233.sql");
  const code = sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
  const fns = code.split("CREATE OR REPLACE FUNCTION").slice(1);
  assert.equal(fns.length, 3);
  for (const fn of fns) {
    assert.doesNotMatch(fn, /p_tenant_id/, "these are the no-tenant overloads (the tenant ones are 20261231413000)");
    assert.match(fn, /tp\.id IN \(SELECT public\.directory_search_public_talent_ids\(p_search\)\)/);
    assert.doesNotMatch(fn, /ILIKE '%' \|\| trim\(p_search\)/);
  }
  assert.match(code, /directory_facet_location_counts\(\s*p_height_min integer,/);
  assert.match(code, /directory_facet_taxonomy_counts_for_kind\(\s*p_kind text,/);
  assert.match(code, /directory_facet_scalar_base_ids\(\s*p_location_city_slug text,/);
  assert.match(sql, /HELD in _pending_pm/);
  assert.match(sql, /ROLLBACK:/);
});
