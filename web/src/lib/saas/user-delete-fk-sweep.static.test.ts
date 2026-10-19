import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// TUL-1020: the user-delete fix is ONE explicit FK, never a catalog-wide sweep (a sweep would
// null audit and money actor columns).
const sql = readFileSync(
  join(process.cwd(), "..", "supabase/migrations/20261231414500_user_delete_fk_sweep.sql"),
  "utf8",
);

test("TUL-1020: the migration re-points builder_catalog_structure.updated_by to ON DELETE SET NULL", () => {
  assert.match(sql, /public\.builder_catalog_structure/);
  assert.match(sql, /updated_by/);
  assert.match(sql, /ON DELETE SET NULL/);
});

test("TUL-1020: the migration stays explicit (no loop over pg_constraint, no other table altered)", () => {
  assert.doesNotMatch(sql, /FOR\s+\w+\s+IN/i);
  const alters = sql.match(/ALTER TABLE\s+([\w.%]+)/gi) ?? [];
  for (const a of alters) assert.match(a, /public\.builder_catalog_structure/);
});
