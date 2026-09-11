#!/usr/bin/env node
// Two concurrent admission_hold_seats calls on one seat. Isolated target only.
// Exit 0 = one win. Exit 1 = both wrote. Exit 2 = no isolated env.

import { assertIsolatedJourneysTarget, JOURNEYS_TENANT_ID } from "./isolated-target-guard.mjs";

assertIsolatedJourneysTarget(process.env, { requireIsolatedFlag: true });

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TENANT = process.env.CAPACITY_PROOF_TENANT_ID ?? process.env.JOURNEYS_TENANT_ID ?? JOURNEYS_TENANT_ID;
const sessionId = process.env.SEAT_HOLD_RACE_SESSION_ID;
const seatId = process.env.SEAT_HOLD_RACE_SEAT_ID;

if (!URL_ || !KEY || !sessionId || !seatId) {
  console.error("[seat-hold-race] set SEAT_HOLD_RACE_SESSION_ID / SEAT_ID on the isolated fixture");
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
  rpc("admission_hold_seats", {
    p_tenant_id: TENANT,
    p_session_id: sessionId,
    p_seat_ids: [seatId],
    p_guest_session_id: "guest-a",
    p_ttl_s: 120,
    p_operation_key: `hold-race-a-${crypto.randomUUID()}`,
  }),
  rpc("admission_hold_seats", {
    p_tenant_id: TENANT,
    p_session_id: sessionId,
    p_seat_ids: [seatId],
    p_guest_session_id: "guest-b",
    p_ttl_s: 120,
    p_operation_key: `hold-race-b-${crypto.randomUUID()}`,
  }),
]);

const wins = [a, b].filter((r) => r?.ok === true).length;
console.log(`[seat-hold-race] PASS wins=${wins} a=${JSON.stringify(a)} b=${JSON.stringify(b)}`);
if (wins !== 1) process.exit(1);
process.exit(0);
