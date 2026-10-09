import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// TUL-486: lpad() truncates, so a code past 99999 (or one odd 8-digit fixture)
// collided on every signup. The migration must keep the guard.
const sql = readFileSync(join(process.cwd(), "..", "supabase/migrations/20261231353000_generate_profile_code_overflow_guard.sql"), "utf8");
const fnBody = sql.slice(sql.indexOf("AS $$"), sql.lastIndexOf("$$;"));

test("the format grows past five digits instead of truncating", () => {
  assert.match(fnBody, /CASE WHEN v_next < 100000 THEN lpad\(v_next::text, 5, '0'\) ELSE v_next::text END/);
  assert.doesNotMatch(fnBody, /RETURN 'TAL-' \|\| lpad\(v_next::text, 5, '0'\)/);
});

test("outliers of seven or more digits do not drag the counter; arithmetic is bigint", () => {
  assert.match(fnBody, /\^TAL-\(\\d\{1,6\}\)\$/);
  assert.match(fnBody, /::bigint/);
  assert.doesNotMatch(fnBody, /v_next\s+INT\b/);
});

test("an existing candidate is skipped in a bounded loop", () => {
  assert.match(fnBody, /EXIT WHEN NOT EXISTS \(SELECT 1 FROM public\.talent_profiles WHERE profile_code = v_code\)/);
  assert.match(fnBody, /v_tries > 1000/);
});

test("grants and security attributes are untouched (CREATE OR REPLACE, no revoke/grant here)", () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.generate_profile_code\(\)/);
  assert.match(sql, /SECURITY DEFINER/);
  assert.doesNotMatch(sql, /\bGRANT\b|\bREVOKE\b/i);
});
