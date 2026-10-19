import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "../../../../supabase/migrations");
const FILE = "20261231418600_dated_places_columns_tul1344.sql";
const sql = readFileSync(join(ROOT, "_pending_pm", FILE), "utf8");
const body = sql.replace(/--.*$/gm, "");

test("TUL-1344 migration is HELD in _pending_pm and sorts after every existing version", () => {
  assert.equal(readdirSync(ROOT).includes(FILE), false);
  const all = [...readdirSync(ROOT), ...readdirSync(join(ROOT, "_pending_pm"))]
    .filter((f) => /^\d{14}_/.test(f) && f !== FILE)
    .map((f) => f.slice(0, 14))
    .sort();
  assert.ok(FILE.slice(0, 14) > all[all.length - 1]);
});

test("adds exactly the five dated-places columns, additive and idempotent", () => {
  for (const col of [
    "sales_close_minutes integer",
    "tier_quotas jsonb",
    "sales_close_at timestamptz",
    "dated_details_i18n jsonb NOT NULL DEFAULT '{}'::jsonb",
    "private_on_request boolean NOT NULL DEFAULT false",
  ]) {
    assert.ok(body.includes(`ADD COLUMN IF NOT EXISTS ${col}`), col);
  }
  assert.doesNotMatch(body, /DROP COLUMN|DROP TABLE|^\s*UPDATE\b|DELETE FROM|INSERT INTO/im);
  assert.doesNotMatch(body, /\bGRANT\b|\bREVOKE\b|CREATE POLICY|DROP POLICY/i);
});

test("rollback SQL is in the header", () => {
  assert.match(sql, /-- Rollback[\s\S]*DROP COLUMN IF EXISTS dated_details_i18n/);
  assert.match(sql, /-- +DROP COLUMN IF EXISTS tier_quotas/);
});
