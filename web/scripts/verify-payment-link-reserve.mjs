#!/usr/bin/env node
// Two concurrent pos_reserve_collection calls for method=link on one order.
// Isolated only. Exit 0 = one claim. Exit 1 = oversell. Exit 2 = no isolated env.

import { assertIsolatedJourneysTarget, JOURNEYS_TENANT_ID } from "./isolated-target-guard.mjs";

assertIsolatedJourneysTarget(process.env, { requireIsolatedFlag: true });

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TENANT = process.env.CAPACITY_PROOF_TENANT_ID ?? process.env.JOURNEYS_TENANT_ID ?? JOURNEYS_TENANT_ID;

if (!URL_ || !KEY) {
  console.error("[payment-link-reserve] missing isolated URL or service role key");
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

const orderId = process.env.PAYMENT_LINK_RACE_ORDER_ID;
const amount = Number(process.env.PAYMENT_LINK_RACE_AMOUNT_CENTS ?? 1000);
if (!orderId) {
  console.error("[payment-link-reserve] set PAYMENT_LINK_RACE_ORDER_ID on the isolated fixture");
  process.exit(1);
}

const [a, b] = await Promise.all([
  rpc("pos_reserve_collection", {
    p_tenant_id: TENANT,
    p_order_id: orderId,
    p_operation_key: `link-race-a-${crypto.randomUUID()}`,
    p_amount_cents: amount,
    p_method: "link",
    p_actor_id: null,
    p_expected_version: null,
    p_ttl_seconds: 1800,
  }),
  rpc("pos_reserve_collection", {
    p_tenant_id: TENANT,
    p_order_id: orderId,
    p_operation_key: `link-race-b-${crypto.randomUUID()}`,
    p_amount_cents: amount,
    p_method: "link",
    p_actor_id: null,
    p_expected_version: null,
    p_ttl_seconds: 1800,
  }),
]);

const wins = [a, b].filter((r) => r?.ok === true).length;
console.log(`[payment-link-reserve] wins=${wins} a=${JSON.stringify(a)} b=${JSON.stringify(b)}`);
if (wins !== 1) process.exit(1);
process.exit(0);
