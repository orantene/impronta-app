/**
 * reserve-set-single-writer.static.test.ts — one writer, and only one.
 *
 * `reserve-set.ts` used to call `reserve_resource_set` and then, whenever the
 * RPC errored or answered `unavailable`, run a SECOND reservation in
 * TypeScript. `unavailable` is precisely the case where the server may have
 * committed and only the answer was lost, so the fallback allocated the same
 * station, seat or person twice.
 *
 * A behavioural test cannot pin the absence of a second path: the fallback was
 * reachable only on a transport failure, which is the one condition no unit
 * test naturally produces and every unit test can be written to avoid. This
 * one reads the module's own source and fails if the writers come back —
 * whether by an import, a re-implementation, or a caller wiring them in.
 *
 * Comments are blanked first, because the paragraph above names every symbol
 * this test forbids and a guard that punishes its own explanation teaches
 * people to delete the explanation.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { blankComments } from "@/lib/quality/supabase-unchecked-read";

const HERE = dirname(fileURLToPath(import.meta.url));
const RESERVE_SET = join(HERE, "reserve-set.ts");
const MIGRATIONS = resolve(HERE, "..", "..", "..", "..", "supabase", "migrations");

/** The names that only a second, client-side reservation path would need. */
const FORBIDDEN = [
  "reserveCapacityBatch",
  "placeReservationHold",
  "releaseReservationHold",
  "releaseCapacity",
  "attemptSet",
  "unwindSet",
];

function source(): string {
  return blankComments(readFileSync(RESERVE_SET, "utf8"));
}

test("reserve-set.ts names no reservation writer of its own", () => {
  const body = source();
  // Vacuity guard: a rename or a move would leave this reading an empty string
  // and passing, which is the failure mode of half the guards in this repo.
  assert.ok(body.length > 2000, `reserve-set.ts read as ${body.length} chars — the guard lost its subject`);
  assert.ok(body.includes("reserveResourceSet"), "this is not reserve-set.ts any more");

  const offenders = FORBIDDEN.filter((name) => body.includes(name));
  assert.deepEqual(
    offenders,
    [],
    "reserve-set.ts must reserve through reserve_resource_set_v2 and nothing else; " +
      "these are the second path that double-allocated on a lost answer",
  );
});

test("the module calls the versioned RPC, and passes an operation key to it", () => {
  const body = source();
  assert.ok(
    body.includes('admin.rpc("reserve_resource_set_v2"'),
    "the set must go through reserve_resource_set_v2",
  );
  assert.ok(body.includes("p_operation_key"), "a call with no operation key cannot be replayed safely");
});

test("no caller can hand reserve-set a writer to use instead", () => {
  const files = readdirSync(HERE)
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => join(HERE, f));
  const offenders: string[] = [];
  for (const file of files) {
    const body = blankComments(readFileSync(file, "utf8"));
    if (/ReserveResourceSetDeps/.test(body)) offenders.push(file.split("/src/")[1] ?? file);
  }
  assert.deepEqual(
    offenders,
    [],
    "the dependency seam was the fallback's entry point; the only seam left is the RPC",
  );
});

test("the SQL still orders holds by talent, which is what stops two sets deadlocking", () => {
  // The ordering used to live in TypeScript (`sortHolds`). It moved into the
  // function with the writes, so this is where it has to be pinned now.
  const sql = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
    .join("\n");
  const v2 = sql.slice(sql.indexOf("FUNCTION public.reserve_resource_set_v2"));
  assert.ok(v2.length > 0, "reserve_resource_set_v2 is not in the migrations");
  assert.match(
    v2.slice(0, v2.indexOf("$$;")),
    /ORDER BY value->>'talent_profile_id', value->>'starts_at'/,
    "holds must be inserted in a deterministic order or two overlapping sets can deadlock",
  );
});

test("the operation ledger is claimed before any resource is touched", () => {
  const sql = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
    .join("\n");
  const v2 = sql.slice(sql.indexOf("FUNCTION public.reserve_resource_set_v2"));
  const body = v2.slice(0, v2.indexOf("$$;"));
  const claim = body.indexOf("INSERT INTO public.resource_set_operations");
  const batch = body.indexOf("reserve_capacity_batch");
  const hold = body.indexOf("INSERT INTO public.talent_holds");
  assert.ok(claim > -1, "the claim is gone");
  assert.ok(batch > claim, "the capacity batch runs before the claim, so a duplicate would not block");
  assert.ok(hold > claim, "the calendar holds run before the claim, so a duplicate would not block");
});

/**
 * The refusal path is where the first version of this function was wrong, and
 * a unit test cannot see it: the double-allocation only shows up as COMMITTED
 * rows in Postgres, which is proven against the isolated branch by
 * `scripts/verify-reserve-set-refusal-atomicity.mjs`. What a static read CAN
 * pin is the shape that makes that proof hold, so the next edit cannot quietly
 * put a value-returning refusal back inside the writing block.
 */
test("every refusal inside the writing block raises, so the block rolls back", () => {
  const sql = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
    .join("\n");
  const v2 = sql.slice(sql.indexOf("FUNCTION public.reserve_resource_set_v2"));
  const body = v2.slice(0, v2.indexOf("$$;"));

  const claim = body.indexOf("INSERT INTO public.resource_set_operations");
  const blockStart = body.indexOf("-- ── the body:");
  const settle = body.indexOf("-- ── settle");
  assert.ok(claim > -1 && blockStart > -1 && settle > -1, "the claim, the writing block or the settle step is gone");
  assert.ok(
    claim < blockStart,
    "the claim must be taken OUTSIDE the writing block, or rolling that block back would erase it and the settle step would have nothing to free",
  );

  const writing = body.slice(blockStart, settle);

  // The handler is the ONE place inside this block that may build a refusal as
  // a value, because by then the rollback has already happened. Everything
  // above it must raise.
  const handler = /\n\s*EXCEPTION\s*\n\s*WHEN SQLSTATE 'RS001' THEN/.exec(writing);
  assert.ok(
    handler,
    "the writing block needs its own EXCEPTION clause; that clause is what makes it a subtransaction",
  );
  const writes = writing.slice(0, handler.index);

  assert.doesNotMatch(
    writes,
    /EXIT\s+work/,
    "a labelled block exited with EXIT is not a subtransaction: it unwinds nothing, so the refusal would commit the rows it had already written",
  );
  assert.doesNotMatch(
    writes,
    /v_result\s*:=\s*jsonb_build_object\(\s*\n?\s*'ok',\s*false/,
    "a refusal that only assigns a value leaves the rows this block already wrote in place; raise RS001 instead so the subtransaction rolls back",
  );

  const raises = writes.match(/RAISE EXCEPTION USING ERRCODE = 'RS001'/g) ?? [];
  assert.ok(
    raises.length >= 5,
    `every in-body refusal must raise RS001; found ${raises.length}, expected at least the 5 the body can reach`,
  );
});
