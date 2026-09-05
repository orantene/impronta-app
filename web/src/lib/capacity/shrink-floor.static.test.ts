/**
 * The shrink floor must stay wired into `upsert_capacity_pool`.
 *
 * The real proof that the refusal WORKS is the `DO` block inside
 * `20261229000216_capacity_shrink_floor.sql`: it builds a pool of 10 with 6 sold,
 * attempts the shrink to 5, and aborts the migration if it is accepted. That runs
 * at apply time against the function it just created, so it cannot pass while the
 * refusal is broken.
 *
 * What that proof CANNOT do is notice a later migration replacing
 * `upsert_capacity_pool` without the check. `CREATE OR REPLACE` is how every
 * function in this engine is edited, the replacement would apply cleanly, and the
 * only symptom would be a venue shrinking a sold-out tier months later. This test
 * is the ratchet against that: it reads the LATEST definition of the function
 * across all migrations and requires the refusal to be in it.
 *
 * Comments are blanked before scanning, so a migration that merely MENTIONS
 * CP015 in a header — including one explaining why the check was removed — does
 * not satisfy this. That is the failure mode a static guard has that ordinary
 * code does not, and I shipped it in this same directory hours before writing
 * this file.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { blankComments } from "@/lib/quality/supabase-unchecked-read";

const MIGRATIONS = join(process.cwd(), "..", "supabase", "migrations");

/** Every migration that redefines `upsert_capacity_pool`, oldest first. */
function definitionsOfUpsert(): { file: string; body: string }[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({ file: f, body: blankComments(readFileSync(join(MIGRATIONS, f), "utf8")) }))
    .filter((m) => /CREATE OR REPLACE FUNCTION public\.upsert_capacity_pool/.test(m.body));
}

test("some migration defines upsert_capacity_pool — the scan is not looking at nothing", () => {
  const defs = definitionsOfUpsert();
  assert.ok(defs.length >= 2, `expected the original plus the floor migration, found ${defs.length}`);
});

test("the LATEST definition of upsert_capacity_pool refuses a shrink below the floor", () => {
  const latest = definitionsOfUpsert().at(-1)!;
  const start = latest.body.indexOf("CREATE OR REPLACE FUNCTION public.upsert_capacity_pool");
  const fn = latest.body.slice(start);

  assert.match(
    fn,
    /capacity_pool_committed_peak\(/,
    `${latest.file} redefines upsert_capacity_pool without consulting the floor. ` +
      `A pool could then be shrunk below its sold seats and the door would find out.`,
  );
  assert.match(
    fn,
    /ERRCODE = 'CP015'/,
    `${latest.file} must raise CP015 so callers can tell "below the floor" from any other failure.`,
  );
  assert.match(
    fn,
    /FOR UPDATE/,
    `the pool row must be locked before the peak is counted, or a reserve can commit ` +
      `a seat between the count and the write.`,
  );
});

test("the floor is computed as a PEAK, not a SUM", () => {
  const peak = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => blankComments(readFileSync(join(MIGRATIONS, f), "utf8")))
    .filter((b) => b.includes("FUNCTION public.capacity_pool_committed_peak"))
    .at(-1)!;

  // A running window sum over ordered start/end events is what makes it a peak.
  // Summing units directly would refuse legitimate shrinks on a pool whose
  // bookings never overlap — a room booked 9-10 and 14-15 has a floor of the
  // larger booking, not their total.
  assert.match(peak, /SUM\(d\) OVER \(ORDER BY t, d\)/, "the sweep must be a running maximum");
  assert.match(
    peak,
    /pool_path @> ARRAY\[p_pool_id\]/,
    "descendants must count against an ancestor, or a venue could be shrunk below its rooms' sales",
  );
});
