#!/usr/bin/env node
// Two concurrent waitlist_accept_offer calls on one offer. Isolated only.
// Exit 0 = one seat. Exit 1 = both accepted. Exit 2 = no isolated env.

import { assertIsolatedJourneysTarget, JOURNEYS_TENANT_ID } from "./isolated-target-guard.mjs";

assertIsolatedJourneysTarget(process.env, { requireIsolatedFlag: true });

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TENANT = process.env.CAPACITY_PROOF_TENANT_ID ?? process.env.JOURNEYS_TENANT_ID ?? JOURNEYS_TENANT_ID;

if (!URL_ || !KEY) {
  console.error("[waitlist-offer-race] missing isolated URL or service role key");
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

const offerId = process.env.WAITLIST_OFFER_RACE_OFFER_ID;
if (!offerId) {
  console.error("[waitlist-offer-race] set WAITLIST_OFFER_RACE_OFFER_ID on the isolated fixture");
  process.exit(1);
}

const [a, b] = await Promise.all([
  rpc("waitlist_accept_offer", {
    p_tenant_id: TENANT,
    p_offer_id: offerId,
    p_operation_key: `accept-race-a-${crypto.randomUUID()}`,
  }),
  rpc("waitlist_accept_offer", {
    p_tenant_id: TENANT,
    p_offer_id: offerId,
    p_operation_key: `accept-race-b-${crypto.randomUUID()}`,
  }),
]);

const wins = [a, b].filter((r) => r?.ok === true && r?.already !== true).length;
const already = [a, b].filter((r) => r?.ok === true && r?.already === true).length;
console.log(`[waitlist-offer-race] fresh=${wins} already=${already} a=${JSON.stringify(a)} b=${JSON.stringify(b)}`);
if (wins > 1) process.exit(1);
if (wins + already < 1) process.exit(1);
process.exit(0);
