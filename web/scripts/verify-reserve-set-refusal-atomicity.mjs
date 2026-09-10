#!/usr/bin/env node
// ============================================================================
// verify-reserve-set-refusal-atomicity.mjs — every refusal of
// reserve_resource_set_v2 must leave NOTHING behind.
// ============================================================================
//
// WHAT THIS PROVES. `reserve_resource_set_v2` answers a refusal as DATA
// (`{ok:false, reason}`), not as an exception, so the transaction it runs in
// COMMITS. If the body already wrote an allocation or a calendar hold before
// it decided to refuse, a returned refusal keeps those rows. And because the
// settle step frees the operation key on a refusal, the identical command can
// be replayed and will write the SAME rows again, without limit.
//
// That is not hypothetical. Against the isolated branch, one valid capacity
// leg plus one hold with an empty talent id refused with reason `invalid` and
// still left the allocation standing; replaying the identical (tenant, key)
// left a second one. Two refused calls, two seats gone.
//
// So this harness drives EVERY reason the function can return, and for each
// one asserts the three facts that make a refusal honest:
//
//   1. zero units are held under that operation key (and the sandbox pool is
//      back to its full count, which also catches an UNSTAMPED leftover),
//   2. no `talent_holds` row survives under that key (nor anywhere in the
//      sandbox window, same reason),
//   3. a replay of the identical (tenant, operation_key) returns the SAME
//      reason, so the key was left in whatever state makes attempt two behave
//      exactly like attempt one.
//
// WHY A DIRECT CONNECTION, NOT PostgREST. Each `SELECT
// reserve_resource_set_v2(...)` on an autocommit connection is its own
// transaction, which is exactly how the RPC arrives in production, and it does
// not depend on the PostgREST schema cache having seen a table this program
// added.
//
// Isolated target only. Never production. It creates one pool under a
// throwaway subject id, works in a 2099 window on one fixture talent, and
// deletes everything it made.
//
//   JOURNEYS_ISOLATED=1 node --env-file=.env.capacity-isolated.local \
//     scripts/verify-reserve-set-refusal-atomicity.mjs
//
// Exit 0 = every refusal left nothing behind and replayed identically.
// Exit 1 = at least one refusal leaked rows or changed its answer.
// Exit 2 = refused (wrong target, or no isolated flag).

import pg from "pg";
import { assertIsolatedJourneysTarget, JOURNEYS_TENANT_ID } from "./isolated-target-guard.mjs";

assertIsolatedJourneysTarget(process.env, { requireIsolatedFlag: true });

const CONNECTION = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING;
if (!CONNECTION) {
  console.error("[refusal-proof] missing DATABASE_URL. Load the isolated env file.");
  process.exit(2);
}

const TENANT = process.env.CAPACITY_PROOF_TENANT_ID ?? process.env.JOURNEYS_TENANT_ID ?? JOURNEYS_TENANT_ID;
const POOL_UNITS = 5;
/** Far-future sandbox: no fixture or sibling agent books here. */
const WINDOW_FLOOR = "2099-01-01T00:00:00Z";

const client = new pg.Client({ connectionString: CONNECTION });
await client.connect();

async function one(sql, params = []) {
  const res = await client.query(sql, params);
  return res.rows[0] ?? null;
}

async function count(sql, params = []) {
  const row = await one(sql, params);
  return Number(row?.n ?? 0);
}

// ── fixtures ────────────────────────────────────────────────────────────────

// `talent_profiles` carries no tenant column, so the journeys fixture ids are
// the only tenant signal here: prefer one of those, fall back to the oldest
// profile so the harness still runs on a bare branch.
const talent = (
  await one(
    `select id from public.talent_profiles
      order by (id::text like '33330003%') desc, created_at
      limit 1`,
  )
)?.id;
if (!talent) {
  console.error("[refusal-proof] no talent profile on this branch; seed the journeys fixture first.");
  process.exit(2);
}

const actor = (await one(`select id from auth.users order by created_at limit 1`))?.id ?? null;

const otherTenant = (
  await one(`select id from public.agencies where id <> $1 order by created_at limit 1`, [TENANT])
)?.id;

const subjectId = (await one(`select gen_random_uuid() as id`)).id;
const poolId = (
  await one(
    `select public.upsert_capacity_pool($1::uuid, 'offering', $2::uuid, $3::int, 'reserve-set-refusal-proof') as id`,
    [TENANT, subjectId, POOL_UNITS],
  )
).id;

let foreignPoolId = null;
if (otherTenant) {
  const foreignSubject = (await one(`select gen_random_uuid() as id`)).id;
  foreignPoolId = (
    await one(
      `select public.upsert_capacity_pool($1::uuid, 'offering', $2::uuid, 2, 'reserve-set-refusal-proof-foreign') as id`,
      [otherTenant, foreignSubject],
    )
  ).id;
}

const keysUsed = new Set();
function freshKey(label) {
  const key = `proof:refusal:${label}:${Math.random().toString(36).slice(2, 10)}`;
  keysUsed.add(key);
  return key;
}

const capacityLeg = (units = 1) => [{ pool_id: poolId, units }];
const validHold = (startsAt, endsAt, extra = {}) => ({
  talent_profile_id: talent,
  starts_at: startsAt,
  ends_at: endsAt,
  title: "refusal-proof",
  ...extra,
});

/** Runs the RPC on its own transaction, exactly as the app calls it. */
async function reserve({ tenantId = TENANT, key, capacity = [], holds = [], ttl = 900 }) {
  const row = await one(
    `select public.reserve_resource_set_v2($1::uuid, $2::text, $3::uuid, $4::int, $5::jsonb, $6::jsonb) as r`,
    [tenantId, key, actor, ttl, JSON.stringify(capacity), JSON.stringify(holds)],
  );
  return row.r;
}

/** Ground truth: what a key owns, and what the whole sandbox holds. */
async function groundTruth(key) {
  return {
    allocationsUnderKey: await count(
      `select count(*)::int as n from public.capacity_allocations
        where operation_key = $1 and state <> 'released'`,
      [key],
    ),
    unitsUnderKey: await count(
      `select coalesce(sum(units), 0)::int as n from public.capacity_allocations
        where operation_key = $1 and state <> 'released'`,
      [key],
    ),
    unitsOnProofPool: await count(
      `select coalesce(sum(units), 0)::int as n from public.capacity_allocations
        where pool_id = $1 and state <> 'released'`,
      [poolId],
    ),
    holdsUnderKey: await count(`select count(*)::int as n from public.talent_holds where operation_key = $1`, [key]),
    holdsInSandbox: await count(
      `select count(*)::int as n from public.talent_holds
        where talent_profile_id = $1 and starts_at >= $2::timestamptz`,
      [talent, WINDOW_FLOOR],
    ),
    operationRows: await count(
      `select count(*)::int as n from public.resource_set_operations
        where tenant_id = $1 and operation_key = $2`,
      [TENANT, key],
    ),
  };
}

// ── the cases: every reason the function can return ─────────────────────────
//
// `sandboxBaseline` is what the sandbox legitimately holds while the case
// runs: zero, except where the case deliberately pre-places a blocking hold.

const cases = [];

cases.push({
  name: "bad_input / null tenant",
  reason: "bad_input",
  args: (key) => ({ tenantId: null, key, capacity: capacityLeg() }),
});

cases.push({
  name: "bad_input / blank operation key",
  reason: "bad_input",
  args: () => ({ key: "   ", capacity: capacityLeg() }),
  keyForTruth: "   ",
});

cases.push({
  name: "empty_batch / nothing asked for",
  reason: "empty_batch",
  args: (key) => ({ key }),
});

cases.push({
  name: "invalid / capacity leg with no pool id",
  reason: "invalid",
  args: (key) => ({ key, capacity: [{ pool_id: "", units: 1 }] }),
});

cases.push({
  name: "pool_not_found / capacity leg naming a pool that is not there",
  reason: "pool_not_found",
  args: (key) => ({ key, capacity: [{ pool_id: "00000000-0000-4000-8000-0000000000ff", units: 1 }] }),
});

if (foreignPoolId) {
  cases.push({
    name: "wrong_tenant / a pool belonging to another agency",
    reason: "wrong_tenant",
    args: (key) => ({ key, capacity: [{ pool_id: foreignPoolId, units: 1 }] }),
  });
}

cases.push({
  name: "sold_out / more units than the pool has",
  reason: "sold_out",
  args: (key) => ({ key, capacity: capacityLeg(POOL_UNITS + 1) }),
});

// THE REVIEWER'S CASE 1. A valid capacity leg, then a hold the function
// refuses as data. Before the fix the allocation survived the refusal AND the
// replay allocated a second one.
cases.push({
  name: "invalid / one good capacity leg then a hold with an empty talent id",
  reason: "invalid",
  args: (key) => ({
    key,
    capacity: capacityLeg(1),
    holds: [{ talent_profile_id: "", starts_at: "2099-03-01T10:00:00Z", ends_at: "2099-03-01T10:45:00Z" }],
  }),
});

// THE REVIEWER'S CASE 2. Two holds on the same person, the first valid, the
// second refused. Before the fix the first hold survived a refused
// reservation, and the replay then answered slot_taken instead of invalid,
// blocked by the ghost its own refusal had left.
cases.push({
  name: "invalid / a good hold then a bad one on the same person",
  reason: "invalid",
  args: (key) => ({
    key,
    holds: [
      validHold("2099-04-01T10:00:00Z", "2099-04-01T10:45:00Z"),
      validHold("2099-04-01T12:00:00Z", "2099-04-01T11:00:00Z"),
    ],
  }),
});

// An exception path, not a returned refusal: the hold's inquiry_id does not
// exist, so the INSERT raises 23503 and the function's OTHERS handler answers
// `unavailable`. It belongs here because the capacity leg ran FIRST.
cases.push({
  name: "unavailable / a capacity leg then a hold whose inquiry does not exist",
  reason: "unavailable",
  args: (key) => ({
    key,
    capacity: capacityLeg(1),
    holds: [
      validHold("2099-05-01T10:00:00Z", "2099-05-01T10:45:00Z", {
        inquiry_id: "00000000-0000-4000-8000-0000000000fe",
      }),
    ],
  }),
});

// slot_taken: a firm hold already covers the window. The blocking hold is
// placed by a SUCCESSFUL reserve under its own key, so the sandbox baseline
// for this case is 1.
cases.push({
  name: "slot_taken / a capacity leg then a window another firm hold owns",
  reason: "slot_taken",
  sandboxBaseline: 1,
  setup: async () => {
    const blockerKey = freshKey("slot-taken-blocker");
    const placed = await reserve({
      key: blockerKey,
      holds: [validHold("2099-06-01T10:00:00Z", "2099-06-01T11:00:00Z")],
    });
    if (placed?.ok !== true) throw new Error(`could not place the blocking hold: ${JSON.stringify(placed)}`);
  },
  args: (key) => ({
    key,
    capacity: capacityLeg(1),
    holds: [validHold("2099-06-01T10:30:00Z", "2099-06-01T10:45:00Z")],
  }),
});

// in_flight: another writer's claim is still live under this key. The claim is
// NOT ours to remove, so this is the one case where an operation row survives
// the refusal, and it must: deleting it would let a duplicate run while the
// first writer is still working.
cases.push({
  name: "in_flight / another writer's live claim owns the key",
  reason: "in_flight",
  expectOperationRow: 1,
  setup: async (key) => {
    await client.query(
      `insert into public.resource_set_operations (tenant_id, operation_key, state, expires_at)
       values ($1, $2, 'in_flight', now() + interval '10 minutes')`,
      [TENANT, key],
    );
  },
  args: (key) => ({ key, capacity: capacityLeg(1) }),
});

// ── run ─────────────────────────────────────────────────────────────────────

const failures = [];
const table = [];

for (const spec of cases) {
  const key = spec.keyForTruth ?? freshKey(spec.reason);
  keysUsed.add(key);
  if (spec.setup) await spec.setup(key);

  const sandboxBaseline = spec.sandboxBaseline ?? 0;
  const expectOperationRow = spec.expectOperationRow ?? 0;

  const first = await reserve(spec.args(key));
  const afterFirst = await groundTruth(key);

  const second = await reserve(spec.args(key));
  const afterSecond = await groundTruth(key);

  const problems = [];
  if (first?.reason !== spec.reason) problems.push(`first answered ${JSON.stringify(first)}, expected ${spec.reason}`);
  if (first?.ok !== false) problems.push(`first was not a refusal: ${JSON.stringify(first)}`);
  if (second?.reason !== spec.reason) problems.push(`replay answered ${second?.reason}, expected the same ${spec.reason}`);

  for (const [label, snap] of [
    ["after the refusal", afterFirst],
    ["after the replay", afterSecond],
  ]) {
    if (snap.unitsUnderKey !== 0) problems.push(`${label}: ${snap.unitsUnderKey} units held under the key`);
    if (snap.allocationsUnderKey !== 0) problems.push(`${label}: ${snap.allocationsUnderKey} allocations stamped with the key`);
    if (snap.unitsOnProofPool !== 0) problems.push(`${label}: ${snap.unitsOnProofPool} units held on the proof pool`);
    if (snap.holdsUnderKey !== 0) problems.push(`${label}: ${snap.holdsUnderKey} talent holds under the key`);
    if (snap.holdsInSandbox !== sandboxBaseline) {
      problems.push(`${label}: ${snap.holdsInSandbox} holds in the sandbox window, expected ${sandboxBaseline}`);
    }
    if (snap.operationRows !== expectOperationRow) {
      problems.push(`${label}: ${snap.operationRows} operation rows, expected ${expectOperationRow}`);
    }
  }

  table.push({
    case: spec.name,
    first: first?.reason ?? JSON.stringify(first),
    replay: second?.reason ?? JSON.stringify(second),
    alloc_key: afterSecond.allocationsUnderKey,
    units_key: afterSecond.unitsUnderKey,
    units_pool: afterSecond.unitsOnProofPool,
    holds_key: afterSecond.holdsUnderKey,
    holds_sandbox: afterSecond.holdsInSandbox,
    op_rows: afterSecond.operationRows,
    verdict: problems.length === 0 ? "PASS" : "FAIL",
  });

  if (problems.length > 0) failures.push({ name: spec.name, problems });

  // Per-case teardown, so one leak cannot cascade into the next case.
  await client.query(`delete from public.talent_holds where talent_profile_id = $1 and starts_at >= $2::timestamptz`, [
    talent,
    WINDOW_FLOOR,
  ]);
  await client.query(`delete from public.capacity_allocations where pool_id = $1`, [poolId]);
  await client.query(`delete from public.resource_set_operations where tenant_id = $1`, [TENANT]);
}

console.table(table);

// ── success still has to work ───────────────────────────────────────────────
//
// An "atomic" function that refuses everything would pass every assertion
// above, so prove the happy path and its replay in the same run.

const okKey = freshKey("accepted");
const accepted = await reserve({
  key: okKey,
  capacity: capacityLeg(2),
  holds: [validHold("2099-07-01T10:00:00Z", "2099-07-01T10:45:00Z")],
});
const replayed = await reserve({
  key: okKey,
  capacity: capacityLeg(2),
  holds: [validHold("2099-07-01T10:00:00Z", "2099-07-01T10:45:00Z")],
});
const afterOk = await groundTruth(okKey);

const okProblems = [];
if (accepted?.ok !== true) okProblems.push(`the accepted set refused: ${JSON.stringify(accepted)}`);
if (accepted?.already !== false) okProblems.push(`the first accepted set claimed to be a replay`);
if (replayed?.ok !== true || replayed?.already !== true) {
  okProblems.push(`the replay did not answer already=true: ${JSON.stringify(replayed)}`);
}
if (JSON.stringify(replayed?.hold_ids) !== JSON.stringify(accepted?.hold_ids)) {
  okProblems.push(`the replay answered with different hold ids`);
}
if (afterOk.unitsUnderKey !== 2) okProblems.push(`the accepted set holds ${afterOk.unitsUnderKey} units, expected 2`);
if (afterOk.holdsUnderKey !== 1) okProblems.push(`the accepted set owns ${afterOk.holdsUnderKey} holds, expected 1`);
if (afterOk.operationRows !== 1) okProblems.push(`the accepted set left ${afterOk.operationRows} operation rows, expected 1`);

console.log(
  `[refusal-proof] accepted set: ok=${accepted?.ok} already=${accepted?.already} -> replay ok=${replayed?.ok} already=${replayed?.already}; ` +
    `${afterOk.unitsUnderKey} units, ${afterOk.holdsUnderKey} hold, ${afterOk.operationRows} operation row`,
);
if (okProblems.length > 0) failures.push({ name: "the accepted set still works", problems: okProblems });

// ── cleanup ─────────────────────────────────────────────────────────────────

await client.query(`delete from public.talent_holds where talent_profile_id = $1 and starts_at >= $2::timestamptz`, [
  talent,
  WINDOW_FLOOR,
]);
await client.query(`delete from public.capacity_allocations where pool_id = $1`, [poolId]);
await client.query(`delete from public.resource_set_operations where tenant_id = $1 and operation_key = any($2::text[])`, [
  TENANT,
  [...keysUsed],
]);
await client.query(`delete from public.capacity_pools where id = $1`, [poolId]);
if (foreignPoolId) await client.query(`delete from public.capacity_pools where id = $1`, [foreignPoolId]);

const leftoverHolds = await count(
  `select count(*)::int as n from public.talent_holds where talent_profile_id = $1 and starts_at >= $2::timestamptz`,
  [talent, WINDOW_FLOOR],
);
console.log(`[refusal-proof] cleaned up; sandbox holds left: ${leftoverHolds}`);

await client.end();

if (failures.length === 0) {
  console.log(`[refusal-proof] PASS - ${cases.length} refusal reasons left nothing behind and replayed identically`);
  process.exit(0);
}

for (const failure of failures) {
  console.error(`[refusal-proof] FAIL ${failure.name}`);
  for (const problem of failure.problems) console.error(`    - ${problem}`);
}
console.error(`[refusal-proof] FAIL - ${failures.length} of ${cases.length + 1} checks leaked or changed answer`);
process.exit(1);
