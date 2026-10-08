/** Static assertions over the TUL-157 hub-roster backfill migration. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(fileURLToPath(new URL(".", import.meta.url)), "../../../../supabase/migrations");
const FILE = "20261231347000_backfill_independent_talent_hub_roster.sql";
const SQL = readFileSync(join(DIR, FILE), "utf8");
// Strip comments so prose cannot trip the keyword checks.
const CODE = SQL.replace(/--.*$/gm, "");

test("only inserts, with the no-active-roster guard and ON CONFLICT DO NOTHING", () => {
  assert.match(CODE, /insert into public\.agency_talent_roster/i);
  assert.match(CODE, /not exists\s*\(\s*select 1 from public\.agency_talent_roster r[\s\S]*r\.status = 'active'/i);
  assert.match(CODE, /on conflict do nothing/i);
  assert.match(CODE, /tp\.deleted_at is null/i);
});

test("hub resolved by kind, never by hard-coded id", () => {
  assert.match(CODE, /a\.kind = 'hub'/);
  assert.match(CODE, /a\.plan_tier = 'network'/);
  assert.doesNotMatch(CODE, /40081ec3/);
});

test("no UPDATE, DELETE, TRUNCATE, DROP or ALTER", () => {
  for (const kw of ["update", "delete", "truncate", "drop", "alter"]) {
    assert.doesNotMatch(CODE, new RegExp(`\\b${kw}\\b`, "i"), kw);
  }
});

// The backfill must run after every migration that existed when it was written
// (newest then: 20261231346400). Later migrations may legitimately sort after it,
// so the old "after every other migration" form broke the first time one landed.
const NEWEST_AT_AUTHORING = "20261231346400";

test("sorts after every migration that existed when it was written", () => {
  const earlier = readdirSync(DIR).filter(
    (f) => f.endsWith(".sql") && f !== FILE && f.slice(0, 14) <= NEWEST_AT_AUTHORING,
  );
  assert.ok(earlier.length > 0);
  for (const f of earlier) assert.ok(FILE > f, `${FILE} must sort after ${f}`);
});
