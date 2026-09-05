import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * The roster import must never infer a conflict target that does not exist.
 *
 * `agency_talent_roster` has NO plain unique index on
 * (tenant_id, talent_profile_id). The only one is PARTIAL:
 *
 *   agency_talent_roster_tenant_talent_live_uniq
 *     UNIQUE (tenant_id, talent_profile_id)
 *     WHERE status = ANY (ARRAY['pending','active','inactive'])
 *
 * PostgREST's `{ onConflict: "tenant_id,talent_profile_id" }` becomes a bare
 * `ON CONFLICT (tenant_id, talent_profile_id)`, which Postgres cannot match to
 * a partial index. Probed through the real client: every row returned 42P10, so
 * the import had never once succeeded.
 *
 * The predicate is NOT the thing to remove. Removal is soft (`status =
 * "removed"`) and re-add does a plain insert, so the partial index is exactly
 * what lets the re-added row exist; a non-partial unique index makes that second
 * insert fail 23505 (verified on a scratch copy of the table).
 *
 * So the guard is on the CODE: this file must not name that pair as a conflict
 * target again. A source-text assertion is the right instrument because the
 * failure is a string PostgREST hands to Postgres, invisible to types.
 */

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "roster-import.ts"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

test("roster import never declares a conflict target on the partial-index pair", () => {
  assert.doesNotMatch(
    src,
    /onConflict:\s*["'`]tenant_id,\s*talent_profile_id["'`]/,
    "agency_talent_roster has only a PARTIAL unique index on that pair; a bare " +
      "ON CONFLICT returns 42P10 for every row",
  );
});

test("roster import scopes its existing-row lookup to the statuses the index covers", () => {
  // If this drifts from the index predicate, the import either misses a live
  // row (and then fails 23505) or matches a removed one (and resurrects it).
  assert.match(src, /\.in\(\s*"status",\s*\[\s*"pending",\s*"active",\s*"inactive"\s*\]\s*\)/);
});

test("a concurrent insert of the same pair is tolerated, not reported as failure", () => {
  // Two imports racing between SELECT and INSERT is a real outcome, and the row
  // we wanted exists either way.
  assert.match(src, /23505/);
});
