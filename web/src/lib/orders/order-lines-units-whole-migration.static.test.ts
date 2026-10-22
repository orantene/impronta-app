import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const PENDING = join(process.cwd(), "..", "supabase", "migrations"); // applied to staging 2026-10-22 (Oran money OK)

test("TUL-1309: the whole-units CHECK is a HELD migration, NOT VALID", () => {
  assert.ok(existsSync(PENDING));
  const name = readdirSync(PENDING).find((f) => f.endsWith("_order_lines_units_whole_tul1309.sql"));
  assert.ok(name, "migration file present");
  const sql = readFileSync(join(PENDING, name!), "utf8");
  assert.match(sql, /ADD CONSTRAINT order_lines_units_whole CHECK \(units = trunc\(units\)\) NOT VALID/);
  assert.match(sql, /VALIDATE CONSTRAINT order_lines_units_whole/, "the validate step is documented");
});
