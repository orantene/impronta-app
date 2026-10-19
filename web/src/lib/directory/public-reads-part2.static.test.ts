/**
 * H2 part 2 (TUL-1269 #12): the second held migration.
 *
 * Run: node_modules/.bin/tsx --test src/lib/directory/public-reads-part2.static.test.ts
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

test("a held migration gates offerings on an approved talent and hides sessions.instructor_user_id from anon", () => {
  const dir = resolve(process.cwd(), "../supabase/migrations/_pending_pm");
  const file = readdirSync(dir).find((f) => /public_reads_offerings_eligibility_sessions_columns/.test(f));
  assert.ok(file, "held migration missing");
  const sql = readFileSync(resolve(dir, file!), "utf8");
  assert.match(sql, /DROP POLICY IF EXISTS talent_offerings_public_read/);
  assert.match(sql, /tp\.workflow_status = 'approved'/);
  assert.match(sql, /column_name <> 'instructor_user_id'/);
  assert.match(sql, /REVOKE SELECT ON TABLE public\.sessions FROM anon/);
  assert.match(sql, /ROLLBACK/);
});
