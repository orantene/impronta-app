/**
 * webhook-v2 — signature verification + OutboundPayment ledger reconciliation.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  verifyStripeSignature,
  applyOutboundPaymentEvent,
  processStripeV2ThinEvent,
} from "@/lib/payments/webhook-v2";

// ── signature verification ──
test("verifyStripeSignature: valid signature passes", () => {
  const secret = "whsec_test";
  const body = '{"type":"x"}';
  const t = 1_700_000_000;
  const sig = crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  const r = verifyStripeSignature(body, `t=${t},v1=${sig}`, secret, { nowSec: t });
  assert.equal(r.ok, true);
});

test("verifyStripeSignature: tampered sig / missing header / stale timestamp fail", () => {
  const secret = "whsec_test";
  const body = '{"type":"x"}';
  const t = 1_700_000_000;
  const sig = crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  assert.equal(verifyStripeSignature(body, `t=${t},v1=${sig.replace(/.$/, "0")}`, secret, { nowSec: t }).ok, false);
  assert.equal(verifyStripeSignature(body, null, secret).ok, false);
  assert.equal(verifyStripeSignature(body, `t=${t},v1=${sig}`, secret, { nowSec: t + 10_000 }).ok, false);
});

// ── ledger reconciliation ──
type Update = { table: string; patch: Record<string, unknown>; id: string };

function makeSb(opts: {
  leg: Record<string, unknown> | null;
  talentStatuses?: Array<{ status: string }>;
  updates: Update[];
}): SupabaseClient {
  const make = (table: string) => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: table === "booking_payouts" ? opts.leg : null, error: null }),
      update: (patch: Record<string, unknown>) => ({
        eq: async (_c: string, id: string) => {
          opts.updates.push({ table, patch, id });
          return { data: null, error: null };
        },
      }),
      // thenable — for `await sb.from('booking_payouts').select('status').eq().eq()`
      then: (resolve: (v: { data: unknown; error: null }) => void) =>
        resolve({ data: table === "booking_payouts" ? (opts.talentStatuses ?? []) : [], error: null }),
    };
    return chain;
  };
  return { from: (t: string) => make(t) } as unknown as SupabaseClient;
}

test("apply: failed event flips a transferred leg → failed", async () => {
  const updates: Update[] = [];
  const sb = makeSb({ leg: { id: "leg1", booking_id: "bk1", status: "transferred", attempts: 1 }, updates });
  const r = await applyOutboundPaymentEvent(
    { type: "v2.money_management.outbound_payment.failed", outboundPaymentId: "obp_1", status: "failed" },
    { sb },
  );
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.action, "failed");
  const legUpdate = updates.find((u) => u.table === "booking_payouts" && u.id === "leg1");
  assert.equal(legUpdate?.patch.status, "failed");
  assert.match(String(legUpdate?.patch.last_error), /failed/);
});

test("apply: posted event on an already-transferred leg → noop (idempotent)", async () => {
  const updates: Update[] = [];
  const sb = makeSb({ leg: { id: "leg1", booking_id: "bk1", status: "transferred", attempts: 1 }, updates });
  const r = await applyOutboundPaymentEvent(
    { type: "v2.money_management.outbound_payment.posted", outboundPaymentId: "obp_1", status: "posted" },
    { sb },
  );
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.action, "noop");
  assert.equal(updates.length, 0, "no write on idempotent replay");
});

test("apply: processing event → noop (intermediate)", async () => {
  const updates: Update[] = [];
  const sb = makeSb({ leg: { id: "leg1", booking_id: "bk1", status: "transferred", attempts: 1 }, updates });
  const r = await applyOutboundPaymentEvent(
    { type: "v2.money_management.outbound_payment.updated", outboundPaymentId: "obp_1", status: "processing" },
    { sb },
  );
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.action, "noop");
});

test("apply: posted event on a failed leg → transferred + payout_lifecycle synced", async () => {
  const updates: Update[] = [];
  const sb = makeSb({
    leg: { id: "leg1", booking_id: "bk1", status: "failed", attempts: 1 },
    talentStatuses: [{ status: "transferred" }],
    updates,
  });
  const r = await applyOutboundPaymentEvent(
    { type: "v2.money_management.outbound_payment.posted", outboundPaymentId: "obp_1", status: "posted" },
    { sb },
  );
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.action, "transferred");
  assert.equal(updates.find((u) => u.table === "booking_payouts")?.patch.status, "transferred");
  assert.ok(updates.some((u) => u.table === "agency_bookings"), "payout_lifecycle synced");
});

test("apply: reversed leg is never downgraded", async () => {
  const updates: Update[] = [];
  const sb = makeSb({ leg: { id: "leg1", booking_id: "bk1", status: "reversed", attempts: 2 }, updates });
  const r = await applyOutboundPaymentEvent(
    { type: "v2.money_management.outbound_payment.failed", outboundPaymentId: "obp_1", status: "failed" },
    { sb },
  );
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.action, "noop");
  assert.equal(updates.length, 0);
});

test("apply: leg not found → noop", async () => {
  const updates: Update[] = [];
  const sb = makeSb({ leg: null, updates });
  const r = await applyOutboundPaymentEvent(
    { type: "v2.money_management.outbound_payment.failed", outboundPaymentId: "obp_unknown", status: "failed" },
    { sb },
  );
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.action, "noop");
});

// ── dispatch ──
test("process: non-outbound event is ignored (no fetch)", async () => {
  let fetched = false;
  const r = await processStripeV2ThinEvent(
    { type: "v2.core.account.updated", related_object: { id: "acct_1" } },
    {
      fetchOutboundPayment: async () => {
        fetched = true;
        return { status: "posted" };
      },
    },
  );
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.action, "ignored");
  assert.equal(fetched, false);
});

test("process: outbound event fetches status then reconciles the ledger", async () => {
  const updates: Update[] = [];
  const sb = makeSb({ leg: { id: "leg1", booking_id: "bk1", status: "transferred", attempts: 1 }, updates });
  const r = await processStripeV2ThinEvent(
    { type: "v2.money_management.outbound_payment.failed", related_object: { id: "obp_1" } },
    { sb, fetchOutboundPayment: async () => ({ status: "failed" }) },
  );
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.action, "failed");
});

test("process: missing related_object id → error", async () => {
  const r = await processStripeV2ThinEvent({ type: "v2.money_management.outbound_payment.failed" });
  assert.equal(r.ok, false);
});
