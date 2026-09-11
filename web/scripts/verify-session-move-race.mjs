#!/usr/bin/env node
// Two concurrent session_move_participant calls onto one remaining seat.
// Isolated only. Exit 0 = one win. Exit 1 = both wrote. Exit 2 = no isolated env.

import { assertIsolatedJourneysTarget, JOURNEYS_TENANT_ID } from "./isolated-target-guard.mjs";

assertIsolatedJourneysTarget(process.env, { requireIsolatedFlag: true });

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TENANT = process.env.CAPACITY_PROOF_TENANT_ID ?? process.env.JOURNEYS_TENANT_ID ?? JOURNEYS_TENANT_ID;

if (!URL_ || !KEY) {
  console.error("[session-move-race] missing isolated URL or service role key");
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

const admissionA = process.env.SESSION_MOVE_RACE_ADMISSION_A;
const admissionB = process.env.SESSION_MOVE_RACE_ADMISSION_B;
const toSession = process.env.SESSION_MOVE_RACE_TO_SESSION;
if (!admissionA || !admissionB || !toSession) {
  console.error("[session-move-race] set SESSION_MOVE_RACE_ADMISSION_A / _B / TO_SESSION on the isolated fixture");
  process.exit(1);
}

const [a, b] = await Promise.all([
  rpc("session_move_participant", {
    p_tenant_id: TENANT,
    p_admission_id: admissionA,
    p_to_session_id: toSession,
    p_operation_key: `move-race-a-${crypto.randomUUID()}`,
  }),
  rpc("session_move_participant", {
    p_tenant_id: TENANT,
    p_admission_id: admissionB,
    p_to_session_id: toSession,
    p_operation_key: `move-race-b-${crypto.randomUUID()}`,
  }),
]);

const wins = [a, b].filter((r) => r?.ok === true && r?.already !== true).length;
console.log(`[session-move-race] wins=${wins} a=${JSON.stringify(a)} b=${JSON.stringify(b)}`);
if (wins !== 1) process.exit(1);
process.exit(0);
