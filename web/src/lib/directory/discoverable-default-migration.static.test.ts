import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { it } from "node:test";

it("a migration defaults is_discoverable to true and backfills approved profiles only", () => {
  const dir = join(process.cwd(), "..", "supabase/migrations");
  const f = readdirSync(dir).find((n) => n.endsWith("_talent_profiles_discoverable_default_on.sql"));
  assert.ok(f, "migration present");
  const sql = readFileSync(join(dir, f!), "utf8");
  assert.match(sql, /SET DEFAULT TRUE/);
  assert.match(sql, /workflow_status = 'approved'/);
  assert.doesNotMatch(sql, /is_test_account/);
});
