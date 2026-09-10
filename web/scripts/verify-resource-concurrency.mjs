#!/usr/bin/env node
// ============================================================================
// verify-resource-concurrency.mjs — the single-unit exclusivity proof.
// ============================================================================
//
// Mirrors verify-capacity-concurrency.mjs's shape but tests the other end of
// the same engine: a pool with exactly ONE unit (a single station, a single
// seat, a single anything-scarce), hit by N genuinely concurrent 1-unit
// reserve_capacity calls. Each call is its own HTTP request through
// PostgREST, so each gets its own connection and its own transaction: this is
// real contention, not a loop. Exactly ONE must win.
//
// Why this is not in the `ci` aggregate: it needs a real Postgres, and CI has
// none. Run it only against an isolated Supabase branch. It creates ONE pool
// under a throwaway subject id and deletes it (cascade takes the allocations
// with it).
//
// Isolated target only. Never production.
//
//   RESOURCE_PROOF_ISOLATED=1 JOURNEYS_ISOLATED=1 \
//     node --env-file=.env.capacity-isolated.local scripts/verify-resource-concurrency.mjs
//
// Exit 0 = exactly 1 of N won and the table agrees. Exit 1 = oversell (a
// genuine finding, not a broken proof). Exit 2 = refused (missing flag or
// pointed somewhere that isn't the isolated target).
//
// It reads GROUND TRUTH from capacity_allocations rather than tallying the
// HTTP replies, for the same reason verify-capacity-concurrency.mjs does:
// under N parallel sockets a handful of requests can die in the client before
// they are ever sent, and a reply-only tally cannot tell that apart from a
// refusal. The row count can.
//
// SUBJECT KIND. capacity_pools.subject_kind carries a hard CHECK constraint
// (capacity_pools_subject_kind_check) limited to exactly five values:
// 'offering', 'space', 'space_group', 'session_tier', 'person'. 'station' is
// not one of them and every call that tried it failed at the INSERT inside
// upsert_capacity_pool with a check-violation, on top of the RPC-name and
// parameter defects this script also had. 'space' is the closest of the five
// to a physical single-instance resource (a table, a station), so that is
// what this proof seeds. upsert_capacity_pool's currently-deployed body (the
// 20261229000216 shrink-floor rewrite superseded the 20261229000212 version
// that validated subject existence against capacity_subject_kinds) does not
// require the subject_id to reference a real row, so a throwaway uuid is
// fine here exactly as it is in the capacity-concurrency proof.

import { assertIsolatedJourneysTarget, JOURNEYS_TENANT_ID } from "./isolated-target-guard.mjs";

assertIsolatedJourneysTarget(process.env, { requireIsolatedFlag: true });

// This script's OWN flag. Earlier versions also accepted CAPACITY_PROOF_ISOLATED,
// which is the flag for verify-capacity-concurrency.mjs's own guard, not this
// proof's — accepting it meant this script could run on the strength of a flag
// that says nothing about this specific proof having been reviewed. Removed.
if (process.env.RESOURCE_PROOF_ISOLATED !== "1") {
  console.error(
    "[resource-proof] refusing. Set RESOURCE_PROOF_ISOLATED=1 (in addition to the isolated-target guard's own flag) on an isolated branch.\n" +
      "  RESOURCE_PROOF_ISOLATED=1 JOURNEYS_ISOLATED=1 node --env-file=.env.capacity-isolated.local scripts/verify-resource-concurrency.mjs",
  );
  process.exit(2);
}

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TENANT = process.env.CAPACITY_PROOF_TENANT_ID ?? process.env.JOURNEYS_TENANT_ID ?? JOURNEYS_TENANT_ID;
const N = Number(process.env.RESOURCE_PROOF_CALLS ?? 50);
const UNITS = Number(process.env.RESOURCE_PROOF_UNITS ?? 1);

if (!URL_ || !KEY) {
  console.error(
    "[resource-proof] missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Load an isolated env file. Do not use .env.vercel.local.",
  );
  process.exit(1);
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function rpc(fn, body) {
  const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${fn} ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  const subjectId = crypto.randomUUID();
  const poolId = await rpc("upsert_capacity_pool", {
    p_tenant_id: TENANT,
    p_subject_kind: "space",
    p_subject_id: subjectId,
    p_units_total: UNITS,
    p_pool_key: "resource-race",
    p_hold_ttl_seconds: 120,
  });
  console.log(`[resource-proof] pool ${poolId}: ${UNITS} unit(s), firing ${N} concurrent 1-unit reserves`);

  const started = Date.now();
  const replies = await Promise.all(
    Array.from({ length: N }, () =>
      rpc("reserve_capacity", { p_pool_id: poolId, p_units: 1, p_ttl_seconds: 120 })
        .then((r) => (r?.ok === true ? "ok" : (r?.reason ?? "unknown")))
        .catch((e) => `client-error (${String(e.message).slice(0, 40)})`)),
  );
  const elapsed = Date.now() - started;

  const tally = replies.reduce((acc, r) => ((acc[r] = (acc[r] ?? 0) + 1), acc), {});

  const rows = await fetch(
    `${URL_}/rest/v1/capacity_allocations?pool_id=eq.${poolId}&select=state,units`,
    { headers },
  ).then((r) => r.json());
  const live = rows.filter((r) => r.state !== "released");
  const unitsHeld = live.reduce((sum, r) => sum + r.units, 0);
  const remaining = await rpc("capacity_remaining_public", { p_pool_id: poolId });

  console.log(`[resource-proof] ${N} calls in ${elapsed}ms`);
  console.log(`[resource-proof] replies: ${JSON.stringify(tally)}`);
  console.log(
    `[resource-proof] ground truth: ${live.length} live allocation(s), ${unitsHeld} unit(s) held, ${remaining} remaining`,
  );

  const pass = unitsHeld === UNITS && live.length === UNITS && remaining === 0 && (tally.ok ?? 0) === UNITS;
  console.log(
    pass
      ? `[resource-proof] PASS — exactly ${UNITS} of ${N} won, zero oversell`
      : `[resource-proof] FAIL — expected ${UNITS} unit(s) held, ground truth saw ${unitsHeld}`,
  );

  await fetch(`${URL_}/rest/v1/capacity_pools?id=eq.${poolId}`, { method: "DELETE", headers });
  const leftover = await fetch(
    `${URL_}/rest/v1/capacity_allocations?pool_id=eq.${poolId}&select=id`,
    { headers },
  ).then((r) => r.json());
  console.log(`[resource-proof] cleaned up; rows left for this pool: ${leftover.length}`);

  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
