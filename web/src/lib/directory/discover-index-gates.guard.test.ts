/**
 * Guard: every gate on `talent_discover_index` must survive a matview rebuild.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Discover index is a materialized view, so changing it means DROP +
 * CREATE — the whole WHERE clause is retyped by hand each time. That has
 * already silently dropped a gate twice:
 *
 *   20260803203521_public_listing_single_gate      added is_publicly_listed
 *   20261110140000_discover_index_public_hygiene   rebuilt WITHOUT it
 *   20261111090000_tenant_discover_exposure        copied the omission forward
 *   20261111100000_..._restore_public_listing_gate restored it
 *
 * Nothing failed when the gate went missing: the rows happened to be blocked
 * by an unrelated workflow_status filter, so the leak stayed latent. A test
 * that pins one migration file cannot catch this — the next rebuild is a NEW
 * file. So this reads whichever migration most recently defines the view and
 * asserts every gate is still there.
 *
 * If you are here because this test failed: you rebuilt the matview and left a
 * gate out. Add it back rather than editing the list — each one is load-bearing
 * and they are not redundant with each other:
 *
 *   is_discoverable            the talent's own opt-in to the Discover catalog
 *   is_publicly_listed         the agency's roster eye (trigger-maintained)
 *   discover_exposure_enabled  the workspace's platform-level veto
 *   is_starter_seed            onboarding template clones must never enter Discover
 *   profile_kind               resource profiles (staff/chairs) are not people
 *
 * Adding a genuinely new gate? Add it to REQUIRED_GATES in the same commit.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../../supabase/migrations",
);

/** Column → why it must be in the WHERE clause (surfaced on failure). */
const REQUIRED_GATES: Array<{ column: string; why: string }> = [
  { column: "is_discoverable", why: "the talent's own Discover opt-in" },
  { column: "is_publicly_listed", why: "the agency's roster eye (trigger-maintained)" },
  { column: "discover_exposure_enabled", why: "the workspace's platform-level veto" },
  { column: "is_starter_seed", why: "onboarding template clones must never enter Discover" },
  { column: "profile_kind", why: "resource profiles (staff/chairs) are not people in the catalog" },
];

const CREATE_RE = /CREATE\s+MATERIALIZED\s+VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.talent_discover_index\b/i;

/** The migration that most recently (re)defines the view wins — that is the
 *  definition the database ends up with. */
function latestDefiningMigration(): { file: string; sql: string } {
  const defining = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort() // timestamp-prefixed ⇒ lexicographic sort is chronological
    .map((file) => ({ file, sql: readFileSync(join(MIGRATIONS_DIR, file), "utf8") }))
    .filter((m) => CREATE_RE.test(m.sql));

  assert.ok(
    defining.length > 0,
    "No migration defines talent_discover_index — did the view move or get renamed?",
  );
  return defining[defining.length - 1]!;
}

/**
 * The CREATE statement alone, with SQL comments stripped.
 *
 * Both narrowings are load-bearing, and a mutation test proved it: the first
 * draft scanned from CREATE to end-of-file, so the trailing
 * `COMMENT ON MATERIALIZED VIEW … Requires … is_publicly_listed …` satisfied
 * the check and the guard still passed with the real gate deleted. Prose about
 * a gate is not a gate.
 */
export function viewDefinition(sql: string): string {
  const from = sql.search(CREATE_RE);
  if (from < 0) return "";
  const rest = sql.slice(from);
  // The CREATE has no inner semicolons (subqueries don't terminate), so the
  // first one ends the statement.
  const end = rest.indexOf(";");
  const stmt = end >= 0 ? rest.slice(0, end) : rest;
  return stmt.replace(/--[^\n]*/g, "");
}

test("the newest talent_discover_index definition keeps every exposure gate", () => {
  const { file, sql } = latestDefiningMigration();

  const body = viewDefinition(sql);

  const missing = REQUIRED_GATES.filter((g) => !body.includes(g.column));

  assert.deepEqual(
    missing.map((g) => g.column),
    [],
    `${file} rebuilds talent_discover_index but drops ${missing.length} gate(s): ` +
      missing.map((g) => `${g.column} (${g.why})`).join(", ") +
      ". A rebuild retypes the whole WHERE clause; carry every gate forward.",
  );
});

test("a dropped gate is NOT masked by comments mentioning it", () => {
  // This is the exact shape that fooled the first draft of this guard: the real
  // gate is gone from the WHERE clause, but the column name still appears in a
  // leading comment and in the trailing COMMENT ON. If this ever passes with a
  // missing gate again, the guard is vacuous and the next silent drop ships.
  const boobyTrapped = [
    "-- This view requires is_publicly_listed and discover_exposure_enabled.",
    "CREATE MATERIALIZED VIEW public.talent_discover_index AS",
    "  SELECT tp.id FROM talent_profiles tp",
    "  WHERE tp.is_discoverable = true;",
    "COMMENT ON MATERIALIZED VIEW public.talent_discover_index IS",
    "  'Honours discover_exposure_enabled and is_publicly_listed.';",
  ].join("\n");

  const body = viewDefinition(boobyTrapped);
  const missing = REQUIRED_GATES.filter((g) => !body.includes(g.column)).map((g) => g.column);

  assert.deepEqual(
    missing.sort(),
    [
      "discover_exposure_enabled",
      "is_publicly_listed",
      "is_starter_seed",
      "profile_kind",
    ],
    "comments must not satisfy a gate the WHERE clause dropped",
  );
});

test("the guard still recognises a real definition", () => {
  // Counterpart to the booby-trap: if CREATE_RE or the slicing silently stopped
  // matching, every gate would read as 'absent' and the guard would be noise
  // rather than protection.
  const { sql } = latestDefiningMigration();
  const body = viewDefinition(sql);
  assert.ok(body.length > 0, "view definition should not be empty");
  assert.ok(/WHERE/i.test(body), "sliced definition should contain the WHERE clause");
  assert.ok(!/COMMENT ON/i.test(body), "slice must stop before the trailing COMMENT ON");
});
