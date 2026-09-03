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
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

// Derived from this file's own location, so the test does not depend on the
// process working directory or on a helper living on another branch.
const MIGRATIONS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..", "..", "..", "..", "supabase", "migrations",
);
// EVERY migration, not just the one that created the table.
//
// This used to read `20261229000212` alone, which made the guard blind to the
// exact flow the registry was designed for: a feature owner registers their own
// kind in THEIR migration when their table ships. Spaces & Seating registered
// `space` and `space_group` in `20261229000221` and this guard could not see
// it — it would have reported them as unregistered forever while they were in
// fact validated, which is a guard scanning one of several trees and reporting
// green. Reading the whole directory means the guard sees a registration
// wherever its owner put it.
const MIGRATION = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
  .join("\n");
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
/**
 * A registration block ends at `ON CONFLICT` **or at the statement terminator,
 * whichever comes first**.
 *
 * The `;` alternative is not tidiness. Reading the whole migrations directory
 * means the corpus is one long string, so a registration written WITHOUT an
 * `ON CONFLICT` — perfectly valid SQL — would otherwise run past the end of its
 * own statement and capture everything up to the next `ON CONFLICT` anywhere in
 * the corpus. Reproduced before fixing:
 *
 *   INSERT INTO public.capacity_subject_kinds (subject_kind, table_name)
 *     VALUES ('space', 'spaces');                    -- no ON CONFLICT
 *   INSERT INTO public.some_other_table (a, b)
 *     VALUES ('session_tier', 'nonsense') ON CONFLICT DO NOTHING;
 *
 *   reported: ["session_tier", "space"]      truth: ["space"]
 *
 * It lies in the DANGEROUS direction — a kind reported validated when it is
 * not, silently shrinking the unregistered list, which is the one thing that
 * list exists to prevent. Nothing triggers it today because both existing
 * registrations use ON CONFLICT; it was a trap laid for whoever writes the
 * third. Found by the Capacity Engine Manager reviewing my own repair.
 */
const REGISTRATION_BLOCK =
  /INSERT INTO public\.capacity_subject_kinds[\s\S]*?VALUES([\s\S]*?)(?:ON CONFLICT|;)/g;

function kindsIn(sql: string): string[] {
  const blocks = [...sql.matchAll(REGISTRATION_BLOCK)];
  const kinds = blocks.flatMap((m) => [...m[1].matchAll(/\('([a-z_]+)',/g)].map((x) => x[1]));
  return [...new Set(kinds)].sort();
}

function registeredKinds(): string[] {
  const blocks = [...MIGRATION.matchAll(REGISTRATION_BLOCK)];
  assert.ok(blocks.length > 0, "could not read any registry seed");
  const kinds = blocks.flatMap((m) => [...m[1].matchAll(/\('([a-z_]+)',/g)].map((x) => x[1]));
  return [...new Set(kinds)].sort();
}

test("a registration without ON CONFLICT does not swallow the next statement", () => {
  // The guard guarding its own regex. Without the `;` alternative this reports
  // session_tier as registered, which would silently shrink the unregistered
  // list below — the exact failure that list exists to prevent.
  const corpus = [
    "INSERT INTO public.capacity_subject_kinds (subject_kind, table_name)",
    "  VALUES ('space', 'spaces');",
    "INSERT INTO public.some_other_table (a, b)",
    "  VALUES ('session_tier', 'nonsense') ON CONFLICT DO NOTHING;",
  ].join("\n");
  assert.deepEqual(kindsIn(corpus), ["space"]);
});

test("a normal multi-row registration with ON CONFLICT still reads every row", () => {
  const corpus = [
    "INSERT INTO public.capacity_subject_kinds (subject_kind, table_name, registered_by)",
    "VALUES ('space', 'spaces', 'spaces-S2'),",
    "       ('space_group', 'space_groups', 'spaces-S2')",
    "ON CONFLICT (subject_kind) DO NOTHING;",
  ].join("\n");
  assert.deepEqual(kindsIn(corpus), ["space", "space_group"]);
});

test("every registered kind is one the engine actually allows", () => {
  const allowed = new Set(allowedKinds());
  for (const kind of registeredKinds()) {
    assert.ok(allowed.has(kind), `registry has '${kind}', which the CHECK does not allow`);
  }
});

test("the unregistered kinds are named, so the coverage gap cannot hide", () => {
  const unregistered = allowedKinds().filter((k) => !registeredKinds().includes(k));
  // These are UNVALIDATED today: a pool of this kind may point at nothing.
  // Each is registered by its owner when their table ships. When one is
  // registered, delete it from this list in the same commit.
  // EMPTY for the first time: every kind in the CHECK constraint now has a
  // backing table, so upsert_capacity_pool validates all of them.
  //   offering, person   — 20261229000212
  //   space, space_group — Spaces & Seating, 20261229000221
  //   session_tier       — Sessions & Classes, 20261229000214
  // If this list grows again, a kind was added to the CHECK without a table.
  assert.deepEqual(
    unregistered.sort(),
    [],
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
