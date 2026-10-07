/** Static assertions over the TUL-157 hub-roster backfill migration. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(fileURLToPath(new URL(".", import.meta.url)), "../../../../supabase/migrations");
const FILE = "20261231346000_backfill_independent_talent_hub_roster.sql";
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

test("sorts after every other migration", () => {
  const others = readdirSync(DIR).filter((f) => f.endsWith(".sql") && f !== FILE);
  for (const f of others) assert.ok(FILE > f, `${FILE} must sort after ${f}`);
});
