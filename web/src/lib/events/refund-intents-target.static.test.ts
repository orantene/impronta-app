import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * The mint's `upsert(..., { onConflict: "order_line_id" })` into
 * `ticket_refund_intents` can only be planned against a NON-partial unique
 * target. `…800` declares it as a table CONSTRAINT (never partial). Pinned
 * here because the sibling target on `admissions` was partial and the mint
 * died at planning (42P10) on every settled order until `…803`.
 */
const MIGRATIONS = join(__dirname, "..", "..", "..", "..", "supabase", "migrations");

test("the refund-intent conflict target is a UNIQUE constraint, not a partial index", () => {
  const sql = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()
    .map((f) => readFileSync(join(MIGRATIONS, f), "utf8")).join("\n");
  assert.match(sql, /CONSTRAINT\s+ticket_refund_intents_one_per_line\s+UNIQUE\s*\(\s*order_line_id\s*\)/i);
  assert.doesNotMatch(sql, /CREATE\s+UNIQUE\s+INDEX\s+\S*ticket_refund_intents\S*[\s\S]*?WHERE/i);
});
