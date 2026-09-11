#!/usr/bin/env node
// Two concurrent visit_transfer calls on one visit. Isolated target only.
// Exit 0 = one win. Exit 1 = both wrote. Exit 2 = no isolated env.

import { assertIsolatedJourneysTarget, JOURNEYS_TENANT_ID } from "./isolated-target-guard.mjs";

assertIsolatedJourneysTarget(process.env, { requireIsolatedFlag: true });

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TENANT = process.env.CAPACITY_PROOF_TENANT_ID ?? process.env.JOURNEYS_TENANT_ID ?? JOURNEYS_TENANT_ID;

if (!URL_ || !KEY) {
  console.error("[visit-transfer-race] missing isolated URL or service role key");
  process.exit(1);
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function rpc(fn, body) {
  const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${fn} ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

const visitId = process.env.VISIT_TRANSFER_RACE_VISIT_ID;
const spaceA = process.env.VISIT_TRANSFER_RACE_SPACE_A;
const spaceB = process.env.VISIT_TRANSFER_RACE_SPACE_B;
if (!visitId || !spaceA || !spaceB) {
  console.error("[visit-transfer-race] set VISIT_TRANSFER_RACE_VISIT_ID / SPACE_A / SPACE_B on the isolated fixture");
  process.exit(1);
}

// Both hosts looked at the same screen: same version. Exactly one may win.
const beforeRes = await fetch(`${URL_}/rest/v1/visits?id=eq.${visitId}&select=version`, { headers });
const expected = (await beforeRes.json())?.[0]?.version;
if (typeof expected !== "number") { console.error("[visit-transfer-race] could not read the visit's version"); process.exit(1); }
const [a, b] = await Promise.all([
  rpc("visit_transfer", {
    p_tenant_id: TENANT,
    p_visit_id: visitId,
    p_to_space: spaceA,
    p_operation_key: `xfer-race-a-${crypto.randomUUID()}`,
    p_expected_version: expected,
  }),
  rpc("visit_transfer", {
    p_tenant_id: TENANT,
    p_visit_id: visitId,
    p_to_space: spaceB,
    p_operation_key: `xfer-race-b-${crypto.randomUUID()}`,
    p_expected_version: expected,
  }),
]);

const wins = [a, b].filter((r) => r?.ok === true).length;
console.log(`[visit-transfer-race] wins=${wins} a=${JSON.stringify(a)} b=${JSON.stringify(b)}`);
if (wins !== 1) process.exit(1);
process.exit(0);
