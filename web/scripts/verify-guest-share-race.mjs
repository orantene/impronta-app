#!/usr/bin/env node
// Two concurrent pos_reserve_collection calls for the last share. Isolated only.
// Exit 0 = one win. Exit 1 = both reserved. Exit 2 = no isolated env.

import { assertIsolatedJourneysTarget, JOURNEYS_TENANT_ID } from "./isolated-target-guard.mjs";

assertIsolatedJourneysTarget(process.env, { requireIsolatedFlag: true });

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TENANT = process.env.CAPACITY_PROOF_TENANT_ID ?? process.env.JOURNEYS_TENANT_ID ?? JOURNEYS_TENANT_ID;
const orderId = process.env.GUEST_SHARE_RACE_ORDER_ID;
const amount = Number(process.env.GUEST_SHARE_RACE_AMOUNT_CENTS ?? "0");

if (!URL_ || !KEY || !orderId || !amount) {
  console.error("[guest-share-race] set GUEST_SHARE_RACE_ORDER_ID and AMOUNT_CENTS on the isolated fixture");
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

const [a, b] = await Promise.all([
  rpc("pos_reserve_collection", {
    p_tenant_id: TENANT,
    p_order_id: orderId,
    p_operation_key: `share-a-${crypto.randomUUID()}`,
    p_amount_cents: amount,
    p_method: "link",
    p_actor_id: TENANT,
    p_expected_version: 1,
    p_ttl_seconds: 120,
  }),
  rpc("pos_reserve_collection", {
    p_tenant_id: TENANT,
    p_order_id: orderId,
    p_operation_key: `share-b-${crypto.randomUUID()}`,
    p_amount_cents: amount,
    p_method: "link",
    p_actor_id: TENANT,
    p_expected_version: 1,
    p_ttl_seconds: 120,
  }),
]);

const wins = [a, b].filter((r) => r?.ok === true).length;
console.log(`[guest-share-race] PASS wins=${wins} a=${JSON.stringify(a)} b=${JSON.stringify(b)}`);
if (wins !== 1) process.exit(1);
process.exit(0);
