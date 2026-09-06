/**
 * A type is only fresh if it can REFUSE.
 *
 * `database.types.ts` is generated, so nothing in the repo notices when it drifts
 * from the database. `check:types-fresh` exists for exactly that and **has never
 * been able to fail**: it needs two Supabase env vars the gate job does not
 * carry, so it prints "skipping" and exits 0 on every run — and even with
 * credentials, drift is a warning unless `TYPES_FRESH_CHECK_HARD_FAIL=1`, which
 * nothing sets. Read a green `types-fresh` as evidence of nothing.
 *
 * This file is the falsifier instead, and it works where that one cannot: it
 * needs no database and no credentials, because **it is checked by `tsc`
 * itself**. Every assertion below fails the build in BOTH directions.
 *
 * WHY IT MATTERS, concretely: a function still listed in the types after it has
 * been dropped means `.rpc("release_offering_stock")` STILL TYPECHECKS. `tsc`
 * waves through a call to a function that does not exist and it fails at runtime,
 * in production. For most of today the only thing standing between someone and
 * that call was a pair of string-matching guards.
 *
 * HOW `@ts-expect-error` MAKES THIS A RATCHET rather than a snapshot: the
 * directive is itself an error when the line below it compiles cleanly
 * ("Unused '@ts-expect-error' directive"). So if a dropped function reappears in
 * the generated types, this file goes red — the guard cannot rot into a
 * tautology the way a `grep` for the name would.
 *
 * Deliberately contains no runtime assertions and no `node:test` import: it is a
 * TYPE test, and the compiler is the whole of it. It carries the `.test.ts`
 * suffix so it lives with the guards rather than in `src`, and `tsc` checks it
 * either way.
 */
import type { Database } from "./database.types";

type Fns = Database["public"]["Functions"];
type Tables = Database["public"]["Tables"];

// ── DROPPED: these must NOT exist. If one comes back, the directive goes unused
//    and tsc fails on THIS line. ──────────────────────────────────────────────

// Dropped in 20261229000215 — the lossy stock shim. Released a QUANTITY rather
// than an identity, so a retry could free a different allocation than the caller
// reserved, which made refund-by-line impossible.
// @ts-expect-error — release_offering_stock is dropped; its presence means stale types
type _DroppedRelease = Fns["release_offering_stock"];

// @ts-expect-error — reserve_offering_stock is dropped; its presence means stale types
type _DroppedReserve = Fns["reserve_offering_stock"];

// ── PRESENT: these must exist. If the types are regenerated against an older
//    database, or reverted, indexing fails and tsc fails here. ────────────────

type _Peak = Fns["capacity_pool_committed_peak"];
type _Extend = Fns["extend_capacity_hold"];
type _Reserve = Fns["reserve_capacity"];
type _Batch = Fns["reserve_capacity_batch"];
type _Commit = Fns["commit_capacity"];
type _ReleaseCapacity = Fns["release_capacity"];
type _SetStock = Fns["set_offering_stock"];
type _UpsertPool = Fns["upsert_capacity_pool"];

type _Pools = Tables["capacity_pools"];
type _Allocations = Tables["capacity_allocations"];
type _Sessions = Tables["sessions"];

// Every alias above is referenced here so `noUnusedLocals` cannot delete the
// check by deleting the alias.
export type DatabaseTypesFreshnessProbe = [
  _DroppedRelease,
  _DroppedReserve,
  _Peak,
  _Extend,
  _Reserve,
  _Batch,
  _Commit,
  _ReleaseCapacity,
  _SetStock,
  _UpsertPool,
  _Pools,
  _Allocations,
  _Sessions,
];
