#!/usr/bin/env node
// Cash outbox applies once; a provider-touching command is not_replayable.
// Isolated target only. Exit 0 = cash already/ok and card refused. Exit 2 = no env.

import { assertIsolatedJourneysTarget, JOURNEYS_TENANT_ID } from "./isolated-target-guard.mjs";

assertIsolatedJourneysTarget(process.env, { requireIsolatedFlag: true });

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TENANT = process.env.CAPACITY_PROOF_TENANT_ID ?? process.env.JOURNEYS_TENANT_ID ?? JOURNEYS_TENANT_ID;
const deviceId = process.env.OUTBOX_RACE_DEVICE_ID;
const orderId = process.env.OUTBOX_RACE_ORDER_ID;
const amount = Number(process.env.OUTBOX_RACE_AMOUNT_CENTS ?? "0");

if (!URL_ || !KEY || !deviceId || !orderId || !amount) {
  console.error("[outbox-replay] set OUTBOX_RACE_DEVICE_ID / ORDER_ID / AMOUNT_CENTS on the isolated fixture");
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

const key = `outbox-cash-${crypto.randomUUID()}`;
const [cashA, cashB, card] = await Promise.all([
  rpc("pos_outbox_apply", {
    p_tenant_id: TENANT,
    p_device_id: deviceId,
    p_operation_key: key,
    p_command: { kind: "cash_collect", method: "cash", order_id: orderId, amount_cents: amount },
  }),
  rpc("pos_outbox_apply", {
    p_tenant_id: TENANT,
    p_device_id: deviceId,
    p_operation_key: key,
    p_command: { kind: "cash_collect", method: "cash", order_id: orderId, amount_cents: amount },
  }),
  rpc("pos_outbox_apply", {
    p_tenant_id: TENANT,
    p_device_id: deviceId,
    p_operation_key: `outbox-card-${crypto.randomUUID()}`,
    p_command: { kind: "card_collect", method: "online_card", provider: "stripe", order_id: orderId, amount_cents: amount },
  }),
]);

const cashWins = [cashA, cashB].filter((r) => r?.ok === true).length;
const cardRefused = card?.ok === false && card?.reason === "not_replayable";
console.log(
  `[outbox-replay] PASS cashWins=${cashWins} cardRefused=${cardRefused} a=${JSON.stringify(cashA)} b=${JSON.stringify(cashB)} card=${JSON.stringify(card)}`,
);
if (cashWins < 1 || !cardRefused) process.exit(1);
process.exit(0);
