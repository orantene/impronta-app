import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// TUL-1233 / TUL-1789: facet counts read residence_city_id / location_id while cards fall back to home_city_text,
// so staging showed 92 profiles beside "Mexico (1)". The held backfill fills the ids from the text; this pins its guards.
const sql = readFileSync(
  join(process.cwd(), "..", "supabase/migrations/20261231431800_backfill_talent_residence_city_from_text_tul1233.sql"),
  "utf8",
);
// Executable SQL only (the header documents a preview SELECT in comments).
const exec = sql
  .split("\n")
  .filter((l) => !l.trimStart().startsWith("--"))
  .join("\n");
const listSrc = readFileSync(join(process.cwd(), "src/lib/directory/fetch-directory-page.ts"), "utf8");
const rpcSql = readFileSync(
  join(process.cwd(), "..", "supabase/migrations/_pending_pm/20261231425700_directory_facet_counts_hub_use_list_search_tul1233.sql"),
  "utf8",
);

test("TUL-1233 backfill: only rows with no city ids and non-empty text are touched, never overwritten", () => {
  assert.match(exec, /tp\.residence_city_id IS NULL\s+AND tp\.location_id IS NULL\s+AND nullif\(trim\(tp\.home_city_text\), ''\) IS NOT NULL/);
  assert.match(exec, /AND tp\.residence_city_id IS NULL\s+AND tp\.location_id IS NULL;/);
  assert.match(exec, /COALESCE\(\s+tp\.residence_country_id/);
});

test("TUL-1233 backfill: only an unambiguous match is applied", () => {
  assert.match(exec, /HAVING count\(DISTINCT location_id\) = 1/);
  assert.match(exec, /l\.archived_at IS NULL/);
});

test("TUL-1233 backfill: no inserts, no other columns, no unaccent dependency", () => {
  assert.doesNotMatch(exec, /INSERT\s+INTO/i);
  assert.doesNotMatch(exec, /DELETE\s+FROM/i);
  assert.doesNotMatch(exec, /unaccent/i);
  const set = exec.match(/SET([\s\S]*?)FROM unambiguous/)?.[1] ?? "";
  const cols = [...set.matchAll(/^\s*(?:SET\s+)?(\w+)\s*=/gm)].map((m) => m[1]);
  assert.deepEqual(cols, ["residence_city_id", "residence_country_id"]);
  assert.equal((exec.match(/UPDATE public\./g) ?? []).length, 1);
  assert.match(exec, /UPDATE public\.talent_profiles tp/);
});

test("TUL-1233 backfill: ids it fills are what the card reads first and the facet joins", () => {
  assert.match(listSrc, /pick\(profile\.residence_city\) \?\? pick\(profile\.legacy_location\)/);
  assert.match(rpcSql, /tp\.residence_city_id = l\.id OR tp\.location_id = l\.id/);
});
