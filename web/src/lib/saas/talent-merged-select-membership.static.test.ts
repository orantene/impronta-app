/**
 * TUL-1359: talent_profiles_merged_select_public still had `OR is_agency_staff()`,
 * a GLOBAL role check, so staff of ANY agency read every talent through it. The
 * held migration drops that clause: the merged policy keeps only the own-row and
 * public/approved branches; staff read through talent_select_staff, which is
 * roster-scoped (staff_can_access_talent_profile, migration 415400).
 *
 * Run: npm run test:wt -- src/lib/saas/talent-merged-select-membership.static.test.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const DIR = join(REPO, "supabase", "migrations", "_pending_pm");
const FILE = existsSync(DIR) ? readdirSync(DIR).find((f) => f.endsWith("_talent_merged_select_membership_tul1359.sql")) : undefined;
const sql = FILE ? readFileSync(join(DIR, FILE), "utf8") : "";

function createPolicy(): string {
  const start = sql.search(/^CREATE POLICY "talent_profiles_merged_select_public"/m);
  assert.ok(start >= 0, "the merged policy must be recreated");
  return sql.slice(start, sql.indexOf(";", start));
}

test("the held migration exists in _pending_pm, above every applied version", () => {
  assert.ok(FILE, "migration file missing");
  const v = Number(FILE!.slice(0, 14));
  assert.ok(v > 20261231417400, "version must be above the highest existing one");
});

test("the recreated merged policy has no global is_agency_staff clause", () => {
  assert.ok(!/is_agency_staff/.test(createPolicy()));
});

test("the own-row and public/approved branches are unchanged", () => {
  const p = createPolicy();
  assert.match(p, /user_id = auth\.uid\(\)/);
  assert.match(p, /deleted_at IS NULL/);
  assert.match(p, /is_publicly_hidden = false/);
  assert.match(p, /talent_has_public_roster\(id\)/);
  assert.match(p, /FOR SELECT/);
  assert.match(p, /TO public/);
});

test("staff access stays via the roster-scoped talent_select_staff policy", () => {
  assert.match(sql, /staff_can_access_talent_profile/);
  assert.match(sql, /talent_select_staff/);
});

test("the rollback SQL is in the header and is one transaction", () => {
  const header = sql.slice(0, sql.search(/^BEGIN;/m));
  assert.match(header, /ROLLBACK SQL/);
  assert.match(header, /OR \(is_agency_staff\(\)\)/);
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
});
