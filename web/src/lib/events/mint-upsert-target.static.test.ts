import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * The mint's `ON CONFLICT (order_line_id, line_seq)` can only be planned if
 * the unique index it infers against is NOT partial. `…360` created it with
 * a WHERE clause; every settled order then died at planning (42P10) and no
 * admission was ever minted — found by Reservations, fixed in `…803`.
 * A test suite that never runs the statement cannot see that, so this pins
 * the SHAPE from the migration files: the LAST definition of the index must
 * carry no predicate.
 */
const MIGRATIONS = join(__dirname, "..", "..", "..", "..", "supabase", "migrations");

function lastIndexDefinition(name: string): string | null {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  let last: string | null = null;
  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS, f), "utf8");
    const re = new RegExp(`CREATE\\s+UNIQUE\\s+INDEX\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${name}\\b[\\s\\S]*?;`, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) last = m[0];
  }
  return last;
}

test("the mint's conflict target (order_line_id, line_seq) is a NON-partial unique index", () => {
  const def = lastIndexDefinition("admissions_line_seq_uniq");
  assert.ok(def, "admissions_line_seq_uniq is not defined in any migration");
  assert.doesNotMatch(def, /\bWHERE\b/i, `the last definition is partial and ON CONFLICT cannot infer it:\n${def}`);
  assert.match(def, /\(\s*order_line_id\s*,\s*line_seq\s*\)/i);
});
