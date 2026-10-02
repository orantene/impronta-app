import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseProcessingFeePayer,
  getProcessingFeePayer,
  setProcessingFeePayer,
  clientFeeLines,
  sellerFeeLines,
} from "./processing-fee-payer";
import { resolveBookingCommissions } from "./commission";

test("parse: only 'client' is client; everything else is the 'seller' default", () => {
  assert.equal(parseProcessingFeePayer("client"), "client");
  for (const v of ["seller", "", null, undefined, "CLIENT", 1]) assert.equal(parseProcessingFeePayer(v), "seller");
});

function fakeSb(row: unknown, updates: Array<{ table: string; patch: unknown }> = []) {
  return {
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }),
      update: (patch: unknown) => ({
        eq: async () => {
          updates.push({ table, patch });
          return { error: null };
        },
      }),
    }),
  } as unknown as SupabaseClient;
}

test("get defaults to seller when the column is missing / null", async () => {
  assert.equal(await getProcessingFeePayer(fakeSb(null), { kind: "talent", id: "t" }), "seller");
  assert.equal(await getProcessingFeePayer(fakeSb({ processing_fee_payer: "client" }), { kind: "workspace", id: "w" }), "client");
});

test("set writes the right table; rejects junk", async () => {
  const updates: Array<{ table: string; patch: unknown }> = [];
  assert.deepEqual(await setProcessingFeePayer(fakeSb(null, updates), { kind: "workspace", id: "w" }, "client"), { ok: true });
  assert.deepEqual(updates, [{ table: "agencies", patch: { processing_fee_payer: "client" } }]);
  const bad = await setProcessingFeePayer(fakeSb(null, updates), { kind: "talent", id: "t" }, "x" as never);
  assert.equal(bad.ok, false);
  assert.equal(updates.length, 1);
});

const cfg = { default_take_bps: 600, default_take_floor_cents: 0, plan_tier_bps: {}, processing_mode: "pass_through" as const };
const mk = (payer: "seller" | "client", fee?: number) =>
  resolveBookingCommissions({
    tenantId: "t",
    workspacePlan: "free",
    offerLineItems: [{ line_total_cents: 10_000, talent_cost_total_cents: 10_000 }],
    currencyCode: "USD",
    paymentMethod: "card",
    sellerOfRecord: "talent",
    platformConfig: cfg,
    tenantOverride: null,
    processingFeePayer: payer,
    processorFeeRates: { percent: 0.029, fixed_cents: 30 },
    processingFeeCents: fee,
  });

test("client receipt, payer=seller: subtotal + platform fee = total", () => {
  const lines = clientFeeLines(mk("seller"));
  assert.deepEqual(lines.map((l) => l.code), ["service_subtotal", "platform_fee", "total_charged"]);
  assert.deepEqual(lines.map((l) => l.cents), [10_000, 150, 10_150]);
});

test("client receipt, payer=client: adds the processing line; lines sum to the total", () => {
  const lines = clientFeeLines(mk("client"));
  assert.deepEqual(lines.map((l) => l.code), ["service_subtotal", "platform_fee", "processing_fee", "total_charged"]);
  const total = lines.find((l) => l.code === "total_charged")!.cents;
  assert.equal(lines.filter((l) => l.code !== "total_charged").reduce((a, l) => a + l.cents, 0), total);
});

test("talent statement: seller pays => deduction + net; client pays => no deduction, net = subtotal", () => {
  const seller = sellerFeeLines(mk("seller"), 324);
  assert.deepEqual(seller.map((l) => [l.code, l.cents]), [["service_subtotal", 10_000], ["processing_fee", -324], ["net_payout", 9_676]]);
  const client = sellerFeeLines(mk("client"), 334);
  assert.deepEqual(client.map((l) => [l.code, l.cents]), [["service_subtotal", 10_000], ["net_payout", 10_000]]);
  const provisional = sellerFeeLines(mk("seller"), null);
  assert.deepEqual(provisional.map((l) => l.code), ["service_subtotal", "net_payout"]);
});
