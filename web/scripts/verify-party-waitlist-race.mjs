#!/usr/bin/env node
// Two concurrent party_waitlist_seat calls on one entry. Isolated target only.
// Exit 0 = one win. Exit 1 = both wrote. Exit 2 = no isolated env.

import { assertIsolatedJourneysTarget, JOURNEYS_TENANT_ID } from "./isolated-target-guard.mjs";

assertIsolatedJourneysTarget(process.env, { requireIsolatedFlag: true });

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TENANT = process.env.CAPACITY_PROOF_TENANT_ID ?? process.env.JOURNEYS_TENANT_ID ?? JOURNEYS_TENANT_ID;

if (!URL_ || !KEY) {
  console.error("[party-waitlist-race] missing isolated URL or service role key");
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

const entryId = process.env.PARTY_WAITLIST_RACE_ENTRY_ID;
const spaceId = process.env.PARTY_WAITLIST_RACE_SPACE_ID;
if (!entryId || !spaceId) {
  console.error("[party-waitlist-race] set PARTY_WAITLIST_RACE_ENTRY_ID / SPACE_ID on the isolated fixture");
  process.exit(1);
}

const beforeRes = await fetch(`${URL_}/rest/v1/party_waitlist?id=eq.${entryId}&select=version`, { headers });
const expected = (await beforeRes.json())?.[0]?.version;
if (typeof expected !== "number") {
  console.error("[party-waitlist-race] could not read the entry version");
  process.exit(1);
}

const [a, b] = await Promise.all([
  rpc("party_waitlist_seat", {
    p_tenant_id: TENANT,
    p_id: entryId,
    p_space_id: spaceId,
    p_operation_key: `seat-race-a-${crypto.randomUUID()}`,
    p_expected_version: expected,
  }),
  rpc("party_waitlist_seat", {
    p_tenant_id: TENANT,
    p_id: entryId,
    p_space_id: spaceId,
    p_operation_key: `seat-race-b-${crypto.randomUUID()}`,
    p_expected_version: expected,
  }),
]);

const wins = [a, b].filter((r) => r?.ok === true).length;
console.log(`[party-waitlist-race] PASS wins=${wins} a=${JSON.stringify(a)} b=${JSON.stringify(b)}`);
if (wins !== 1) process.exit(1);
process.exit(0);
