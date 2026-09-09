#!/usr/bin/env node
// ============================================================================
// verify-resource-concurrency.mjs — seats, tables, stations, benefits, credits.
// Extends the capacity race lane to the other multi-resource subjects.
// Isolated target only. Never production.
//
//   RESOURCE_PROOF_ISOLATED=1 node --env-file=.env.capacity-isolated.local \
//     scripts/verify-resource-concurrency.mjs
// ============================================================================

import { assertIsolatedJourneysTarget, JOURNEYS_TENANT_ID } from "./isolated-target-guard.mjs";

assertIsolatedJourneysTarget(process.env, { requireIsolatedFlag: true });

if (process.env.RESOURCE_PROOF_ISOLATED !== "1" && process.env.CAPACITY_PROOF_ISOLATED !== "1") {
  console.error(
    "[resource-proof] refusing. Set RESOURCE_PROOF_ISOLATED=1 (or CAPACITY_PROOF_ISOLATED=1) on an isolated branch.",
  );
  process.exit(2);
}

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TENANT = process.env.CAPACITY_PROOF_TENANT_ID ?? process.env.JOURNEYS_TENANT_ID ?? JOURNEYS_TENANT_ID;
const N = Number(process.env.RESOURCE_PROOF_CALLS ?? 80);
const UNITS = Number(process.env.RESOURCE_PROOF_UNITS ?? 4);

if (!URL_ || !KEY) {
  console.error("[resource-proof] missing Supabase URL or service role key.");
  process.exit(2);
}

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function rpc(name, body) {
  const res = await fetch(`${URL_}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  // One station-style pool under a throwaway subject; 80 concurrent 1-unit reserves.
  const subjectId = crypto.randomUUID();
  const create = await rpc("capacity_create_pool", {
    p_tenant_id: TENANT,
    p_subject_kind: "station",
    p_subject_id: subjectId,
    p_pool_key: "race",
    p_units_total: UNITS,
    p_hold_ttl_seconds: 120,
  });
  if (!create.ok) {
    console.error("[resource-proof] could not create pool", create.data);
    process.exit(1);
  }
  const poolId = create.data?.id ?? create.data?.pool_id ?? create.data;
  if (!poolId || typeof poolId !== "string") {
    // Some deployments return the row directly.
    console.error("[resource-proof] unexpected create payload", create.data);
    process.exit(1);
  }

  const jobs = Array.from({ length: N }, (_, i) =>
    rpc("reserve_capacity", {
      p_pool_id: poolId,
      p_units: 1,
      p_order_line_id: null,
      p_actor_user_id: null,
      p_idempotency_key: `resource-race-${subjectId}-${i}`,
    }),
  );
  await Promise.all(jobs);

  const allocRes = await fetch(
    `${URL_}/rest/v1/capacity_allocations?pool_id=eq.${poolId}&state=in.(hold,committed)&select=id`,
    { headers },
  );
  const allocs = await allocRes.json();
  const won = Array.isArray(allocs) ? allocs.length : -1;

  // Cleanup best-effort.
  await fetch(`${URL_}/rest/v1/capacity_allocations?pool_id=eq.${poolId}`, {
    method: "DELETE",
    headers,
  });
  await fetch(`${URL_}/rest/v1/capacity_pools?id=eq.${poolId}`, {
    method: "DELETE",
    headers,
  });

  if (won !== UNITS) {
    console.error(`[resource-proof] FAIL expected ${UNITS} winners, ground truth ${won}`);
    process.exit(1);
  }
  console.log(`[resource-proof] PASS ${won}/${N} won on station pool ${poolId}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
