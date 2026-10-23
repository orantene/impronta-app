import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// TUL-1233: facet counts must be computed over the SAME set as the listing. The listing gates on
// is_publicly_hidden = false, is_publicly_listed = true, profile_kind <> 'resource', deleted_at null
// (public-listing-predicate.ts); the facet functions drifted (retired workflow_status/visibility
// gate, talent_is_site_visible_anywhere, no profile_kind). Pins the migration that realigns them.
const sql = readFileSync(
  join(process.cwd(), "..", "supabase/migrations/20261231431700_directory_facet_counts_match_listing_tul1233.sql"),
  "utf8",
);
const predicate = readFileSync(join(process.cwd(), "src/lib/directory/public-listing-predicate.ts"), "utf8");

const fns = sql.split("CREATE OR REPLACE FUNCTION").slice(1);

test("TUL-1233: the listing predicate is the one the migration mirrors", () => {
  assert.match(predicate, /is_publicly_hidden/);
  assert.match(predicate, /is_publicly_listed/);
  assert.match(predicate, /profile_kind/);
});

test("TUL-1233: all six facet overloads (3 functions x tenant/hub) use the listing predicate", () => {
  assert.equal(fns.length, 6);
  for (const fn of fns) {
    assert.match(fn, /tp\.deleted_at IS NULL/);
    assert.match(fn, /tp\.is_publicly_hidden = false/);
    assert.match(fn, /tp\.is_publicly_listed = true/);
    assert.match(fn, /tp\.profile_kind <> 'resource'/);
    assert.match(fn, /tp\.id IN \(SELECT public\.directory_search_public_talent_ids\(p_search\)\)/);
    assert.doesNotMatch(fn, /workflow_status/);
    assert.doesNotMatch(fn, /tp\.visibility/);
    assert.doesNotMatch(fn, /talent_is_site_visible_anywhere/);
  }
});

test("TUL-1233: tenant overloads scope to the active, eye-on roster; hub overloads do not", () => {
  const tenant = fns.filter((f) => /p_tenant_id uuid/.test(f.split("RETURNS")[0]));
  const hub = fns.filter((f) => !/p_tenant_id uuid/.test(f.split("RETURNS")[0]));
  assert.equal(tenant.length, 3);
  assert.equal(hub.length, 3);
  for (const fn of tenant) {
    assert.match(fn, /r\.tenant_id = p_tenant_id/);
    assert.match(fn, /r\.status = 'active'/);
    assert.match(fn, /r\.agency_visibility IN \('site_visible', 'featured'\)/);
  }
  for (const fn of hub) assert.doesNotMatch(fn, /agency_talent_roster/);
});

test("TUL-1233: stale overloads are dropped, the six kept signatures keep their grants, anon-safe", () => {
  assert.match(sql, /DROP FUNCTION %s/);
  assert.match(sql, /proname IN \(\s*'directory_facet_location_counts',\s*'directory_facet_taxonomy_counts_for_kind',\s*'directory_facet_scalar_base_ids'/);
  assert.equal((sql.match(/GRANT EXECUTE ON FUNCTION/g) ?? []).length, 6);
  assert.doesNotMatch(sql, /SECURITY DEFINER/);
  assert.doesNotMatch(sql, /—/);
});
