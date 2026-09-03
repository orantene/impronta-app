#!/usr/bin/env node
// ============================================================================
// verify-capacity-concurrency.mjs — the capacity engine's exit proof.
// ============================================================================
//
// 200 genuinely concurrent reserve_capacity calls against a 12-unit pool. Each
// call is its own HTTP request through PostgREST, so each gets its own
// connection and its own transaction: this is real contention, not a loop.
// Exactly 12 must win.
//
// Why this is not in the `ci` aggregate: it needs a real Postgres, and CI has
// none. Keeping it out means `check:ci-lane-parity` stays truthful about what
// actually gates a PR. Run it by hand against a Supabase branch (or, as the
// author did, production — it creates ONE pool under a throwaway subject id and
// deletes it, allocations cascading with it, leaving zero rows behind).
//
//   node --env-file=web/.env.vercel.local web/scripts/verify-capacity-concurrency.mjs
//
// Exit 0 = exactly 12 of 200 won and the table agrees. Exit 1 = oversell.
//
// It reads GROUND TRUTH from capacity_allocations rather than tallying the HTTP
// replies. That matters: under 200 parallel sockets a handful of requests die in
// the client before they are ever sent, and a reply-only tally cannot tell that
// apart from a refusal. The row count can.

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TENANT = process.env.CAPACITY_PROOF_TENANT_ID ?? "00000000-0000-0000-0000-000000000001";
const N = Number(process.env.CAPACITY_PROOF_CALLS ?? 200);
const UNITS = Number(process.env.CAPACITY_PROOF_UNITS ?? 12);

if (!URL_ || !KEY) {
  console.error("[capacity-proof] missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
    "Run with --env-file=web/.env.vercel.local (after `vercel env pull`).");
  process.exit(1);
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function rpc(fn, body) {
  const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${fn} ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

const subjectId = crypto.randomUUID();
const poolId = await rpc("upsert_capacity_pool", {
  p_tenant_id: TENANT,
  p_subject_kind: "offering",
  p_subject_id: subjectId,
  p_units_total: UNITS,
  p_pool_key: "concurrency-proof",
});
console.log(`[capacity-proof] pool ${poolId}: ${UNITS} units, firing ${N} concurrent reserves`);

const started = Date.now();
const replies = await Promise.all(
  Array.from({ length: N }, () =>
    rpc("reserve_capacity", { p_pool_id: poolId, p_units: 1, p_ttl_seconds: 600 })
      .then((r) => (r?.ok === true ? "ok" : (r?.reason ?? "unknown")))
      .catch((e) => `client-error (${String(e.message).slice(0, 40)})`)),
);
const elapsed = Date.now() - started;

const tally = replies.reduce((acc, r) => ((acc[r] = (acc[r] ?? 0) + 1), acc), {});
const rows = await fetch(`${URL_}/rest/v1/capacity_allocations?pool_id=eq.${poolId}&select=state,units`, { headers })
  .then((r) => r.json());
const live = rows.filter((r) => r.state !== "released");
const unitsHeld = live.reduce((sum, r) => sum + r.units, 0);
const remaining = await rpc("capacity_remaining_public", { p_pool_id: poolId });

console.log(`[capacity-proof] ${N} calls in ${elapsed}ms`);
console.log(`[capacity-proof] replies: ${JSON.stringify(tally)}`);
console.log(`[capacity-proof] ground truth: ${live.length} live allocations, ${unitsHeld} units held, ${remaining} remaining`);

const pass = unitsHeld === UNITS && live.length === UNITS && remaining === 0 && (tally.ok ?? 0) === UNITS;
console.log(pass
  ? `[capacity-proof] PASS — exactly ${UNITS} of ${N} won, zero oversell`
  : `[capacity-proof] FAIL — expected ${UNITS} units held, saw ${unitsHeld}`);

await fetch(`${URL_}/rest/v1/capacity_pools?id=eq.${poolId}`, { method: "DELETE", headers });
const leftover = await fetch(`${URL_}/rest/v1/capacity_allocations?pool_id=eq.${poolId}&select=id`, { headers })
  .then((r) => r.json());
console.log(`[capacity-proof] cleaned up; rows left for this pool: ${leftover.length}`);

process.exit(pass ? 0 : 1);
