import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/** Step A of the hold-the-send design: the enum value alone, nothing that changes behaviour. */
const sql = readFileSync(join(process.cwd(), "..", "supabase/migrations/20261231356000_offer_status_awaiting_talent.sql"), "utf8");
const statements = sql
  .split("\n")
  .filter((l) => !l.trim().startsWith("--") && l.trim().length > 0)
  .join("\n");

test("migration A only adds the awaiting_talent value, idempotently, and touches no function or trigger", () => {
  assert.match(statements, /^ALTER TYPE public\.inquiry_offer_status ADD VALUE IF NOT EXISTS 'awaiting_talent';$/);
  assert.doesNotMatch(statements, /CREATE\s+(OR REPLACE\s+)?(FUNCTION|TRIGGER|VIEW)|UPDATE\s|INSERT\s|DROP\s/i);
});

test("the generated types list the new value so tsc sees the full enum", () => {
  const types = readFileSync(join(process.cwd(), "src/lib/supabase/database.types.ts"), "utf8");
  assert.match(types, /\| "expired"\s+\| "awaiting_talent"/);
  assert.match(types, /"expired",\s+"awaiting_talent",/);
});
