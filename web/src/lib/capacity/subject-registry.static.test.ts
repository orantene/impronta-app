/**
 * The subject registry, and the gap it deliberately leaves visible.
 *
 * `capacity_pools.subject_id` is polymorphic, so it can carry no foreign key: a
 * pool can point at a row that does not exist. `capacity_subject_kinds` maps
 * each subject_kind to its backing table and `upsert_capacity_pool` validates
 * against it.
 *
 * An UNREGISTERED kind is permitted rather than blocked, because the alternative
 * is that the engine stops a feature shipping until it registers. The cost of
 * that choice is a silent gap, so this test names the unregistered kinds out
 * loud. A guard whose coverage nobody can see is how this repo shipped six
 * guards that were green while measuring nothing.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

// Derived from this file's own location, so the test does not depend on the
// process working directory or on a helper living on another branch.
const MIGRATIONS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..", "..", "..", "..", "supabase", "migrations",
);
const MIGRATION = readFileSync(
  join(MIGRATIONS, "20261229000212_capacity_tenant_and_subject_integrity.sql"),
  "utf8",
);
const ENGINE = readFileSync(
  join(MIGRATIONS, "20261229000200_capacity_engine.sql"),
  "utf8",
);

/** The kinds the engine's CHECK constraint allows. */
function allowedKinds(): string[] {
  const m = /subject_kind\s+text\s+NOT NULL\s+CHECK \(subject_kind IN\s*\(([^)]+)\)/.exec(ENGINE);
  assert.ok(m, "could not read the subject_kind CHECK from the engine migration");
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
}

/** The kinds seeded into the registry today. */
function registeredKinds(): string[] {
  const m = /INSERT INTO public\.capacity_subject_kinds[\s\S]*?VALUES([\s\S]*?)ON CONFLICT/.exec(
    MIGRATION,
  );
  assert.ok(m, "could not read the registry seed");
  return [...m[1].matchAll(/\('([a-z_]+)',/g)].map((x) => x[1]);
}

test("every registered kind is one the engine actually allows", () => {
  const allowed = new Set(allowedKinds());
  for (const kind of registeredKinds()) {
    assert.ok(allowed.has(kind), `registry has '${kind}', which the CHECK does not allow`);
  }
});

test("the unregistered kinds are named, so the coverage gap cannot hide", () => {
  const unregistered = allowedKinds().filter((k) => !registeredKinds().includes(k));
  // These are UNVALIDATED today: a pool of this kind may point at nothing.
  // Each is registered by its owner when their table ships — Spaces & Seating
  // for space and space_group, Sessions & Classes for session_tier. When one is
  // registered, delete it from this list in the same commit.
  assert.deepEqual(
    unregistered.sort(),
    ["session_tier", "space", "space_group"],
    "the set of unvalidated subject kinds changed — update this list deliberately",
  );
});

test("registering a table that does not exist is refused, not silently ignored", () => {
  // Fail-open is the failure mode that makes a guard measure nothing, so the
  // registration itself is verified against to_regclass by a trigger.
  assert.match(MIGRATION, /to_regclass\('public\.' \|\| quote_ident\(NEW\.table_name\)\) IS NULL/);
  assert.match(MIGRATION, /RAISE EXCEPTION[\s\S]{0,160}does not exist/);
});

test("a cross-tenant stock edit is refused, and says nothing about whether the id exists", () => {
  assert.match(
    MIGRATION,
    /IF p_tenant_id IS NOT NULL AND v_tenant IS DISTINCT FROM p_tenant_id THEN\s*\n\s*RETURN jsonb_build_object\('ok', false, 'reason', 'offering_not_found'\)/,
    "a wrong-tenant caller must get offering_not_found, not a distinct reason that confirms the id",
  );
});

test("the unguarded 2-arg set_offering_stock overload is dropped", () => {
  // Leaving it would keep an unguarded overload any caller could reach; the
  // 3-arg version has a DEFAULT, so existing 2-arg calls still resolve.
  assert.match(MIGRATION, /DROP FUNCTION IF EXISTS public\.set_offering_stock\(uuid, int\);/);
});

test("a multi-line cart can attribute each allocation to its own line", () => {
  // Before 0.11 `reserve_capacity_batch` stamped ONE order_line_id on every
  // allocation, so a cart with a GA line and a VIP line had to choose between a
  // correct ledger and cross-line atomicity. Attribution is not cosmetic:
  // refund-by-line reads this column to decide which units to free.
  const M = readFileSync(
    join(MIGRATIONS, "20261229000213_batch_per_line_attribution.sql"),
    "utf8",
  );
  assert.match(
    M,
    /COALESCE\(NULLIF\(r->>'order_line_id', ''\)::uuid, p_order_line_id\) AS order_line_id/,
    "each request must take its own order_line_id, falling back to the batch-level one",
  );
  // The fallback is what keeps every existing caller working unchanged.
  assert.match(M, /p_order_line_id uuid DEFAULT NULL/);
  // And the lock order must survive the change, or two concurrent carts over the
  // same pools can deadlock against each other.
  assert.match(M, /ORDER BY p\.pool_path::text NULLS LAST/);
});
