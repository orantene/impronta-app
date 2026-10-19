/**
 * TUL-1359: talent_profiles_merged_select_public could carry `OR is_agency_staff()`, a GLOBAL
 * role check, so staff of ANY agency read every talent. The held migration is state-aware:
 * environments differ (staging has the SPLIT policies and no merged one).
 *   branch A (merged present with is_agency_staff): drop it; recreate the scoped version only
 *            when the split own/public policies are absent.
 *   branch B (merged absent / already clean, i.e. split shape): no-op with a NOTICE.
 * Staff keep reading via the roster-scoped talent_select_staff (415400).
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
const body = sql.slice(sql.search(/^BEGIN;/m));
const doBlock = body.slice(body.indexOf("DO $$"), body.lastIndexOf("END $$;"));

test("the held migration exists in _pending_pm, above every applied version", () => {
  assert.ok(FILE, "migration file missing");
  assert.ok(Number(FILE!.slice(0, 14)) > 20261231417400);
});

test("the guard needs the roster-scoped staff path before touching anything", () => {
  assert.match(doBlock, /to_regprocedure\('public\.staff_can_access_talent_profile\(uuid\)'\) IS NULL/);
  assert.match(doBlock, /policyname = 'talent_select_staff'/);
  assert.ok(doBlock.indexOf("talent_select_staff") < doBlock.indexOf("DROP POLICY"), "guard runs before the drop");
});

test("branch B: merged policy absent or already clean is a no-op with a NOTICE naming the shape", () => {
  assert.match(doBlock, /IF merged_qual IS NULL THEN\s+RAISE NOTICE 'TUL-1359 no-op: [^']*split policy shape[^']*';\s+RETURN;/);
  assert.match(doBlock, /merged_qual NOT ILIKE '%is_agency_staff\(\)%' THEN\s+RAISE NOTICE 'TUL-1359 no-op:[^']*';\s+RETURN;/);
});

test("branch A: only a merged policy whose qual contains is_agency_staff() is dropped", () => {
  const drop = doBlock.indexOf('DROP POLICY "talent_profiles_merged_select_public"');
  assert.ok(drop > doBlock.indexOf("NOT ILIKE"), "drop comes after both no-op returns");
  assert.ok(!/DROP POLICY IF EXISTS/.test(doBlock), "no unconditional drop");
});

test("branch A: recreated only when the split own/public policies are absent", () => {
  assert.match(doBlock, /policyname IN \('talent_select_own', 'talent_select_public'\)/);
  assert.match(doBlock, /IF split_present THEN[\s\S]*?not recreated[\s\S]*?ELSE\s+CREATE POLICY "talent_profiles_merged_select_public"/);
});

test("the recreated policy has no global staff clause and keeps own + public/approved", () => {
  const create = doBlock.slice(doBlock.indexOf("ELSE\n    CREATE POLICY"));
  const using = create.slice(create.indexOf("USING"), create.indexOf(";"));
  assert.ok(!/is_agency_staff/.test(using));
  assert.match(using, /user_id = auth\.uid\(\)/);
  assert.match(using, /deleted_at IS NULL/);
  assert.match(using, /is_publicly_hidden = false/);
  assert.match(using, /talent_has_public_roster\(id\)/);
  assert.match(create, /FOR SELECT\s+TO public/);
});

test("there is no unconditional policy DDL outside the DO block; one transaction", () => {
  const outside = body.replace(doBlock, "");
  assert.ok(!/CREATE POLICY|DROP POLICY/.test(outside));
  assert.match(body, /^COMMIT;/m);
});

test("the rollback header matches the state-aware behaviour", () => {
  const header = sql.slice(0, sql.search(/^BEGIN;/m));
  assert.match(header, /ROLLBACK SQL/);
  assert.match(header, /skip it if the NOTICE said no-op/);
  assert.match(header, /OR \(is_agency_staff\(\)\)/);
  assert.match(header, /STATE-AWARE/);
});
