/**
 * TUL-1693: 422700 narrows agency_talent_roster SELECT to an explicit column list for anon and
 * authenticated. keep_visible is added later (423300), so its migration must grant the column,
 * or the public directory's pick read fails with 42501 and owner picks are silently ignored.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const repo = join(__dirname, "..", "..", "..", "..");
const held = join(repo, "supabase/migrations/_pending_pm/20261231423300_roster_keep_visible.sql");
const applied = join(repo, "supabase/migrations/20261231423300_roster_keep_visible.sql");

function migrationSql(): string {
  const path = existsSync(held) ? held : applied;
  return readFileSync(path, "utf8").replace(/--[^\n]*/g, "");
}

test("423300 grants column SELECT on keep_visible to anon and authenticated", () => {
  const sql = migrationSql();
  assert.match(
    sql,
    /GRANT\s+SELECT\s*\(\s*keep_visible\s*\)\s+ON\s+public\.agency_talent_roster\s+TO\s+anon\s*,\s*authenticated\s*;/i,
  );
});

test("the grant comes after the column is added", () => {
  const sql = migrationSql();
  const add = sql.search(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+keep_visible/i);
  const grant = sql.search(/GRANT\s+SELECT\s*\(\s*keep_visible\s*\)/i);
  assert.ok(add >= 0 && grant > add, "GRANT must follow ADD COLUMN");
});
