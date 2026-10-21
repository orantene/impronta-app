/**
 * TUL-1366 consultant fixes: the service fee fails closed at checkout, is frozen
 * at quote time (order, offer), POS charges none, and the cancel/refund rule is
 * decided once at cancel time.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { loadBookingCancelContext, serviceFeeRefundableOnCancel } from "./booking-cancelled-by";
import { nonRefundableFeeCents } from "./commission";
import { freezeOfferServiceFee } from "./offer-service-fee";
import { FEE_UNAVAILABLE_MESSAGE } from "./pass-through-arming";
import { resolveCheckoutCollectOrRefuse } from "../orders/purchase-collect";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const asAdmin = (x: unknown) => x as SupabaseClient;

const input = (over: Record<string, unknown> = {}) => ({
  tenantId: "t1",
  orderCurrency: "USD",
  lines: [],
  subtotalCents: 10_000,
  totalCents: 10_000,
  collect: "full" as const,
  depositPct: null,
  payInPerson: false,
  ...over,
});

describe("checkout fails closed", () => {
  test("a fee read that fails REFUSES the checkout with a plain retry message", async () => {
    const prev = process.env.COMMISSION_PROCESSING_PASS_THROUGH;
    delete process.env.COMMISSION_PROCESSING_PASS_THROUGH;
    try {
      const r = await resolveCheckoutCollectOrRefuse(asAdmin({ rpc: async () => ({ data: null, error: { message: "boom" } }) }), input());
      assert.deepEqual(r, { ok: false, error: FEE_UNAVAILABLE_MESSAGE });
      assert.match(FEE_UNAVAILABLE_MESSAGE, /Nothing was charged\. Try again\./);
    } finally {
      if (prev !== undefined) process.env.COMMISSION_PROCESSING_PASS_THROUGH = prev;
    }
  });

  test("POS (staff channel) charges no client fee and never reads the fee settings", async () => {
    for (const sourceChannel of ["pos", "pos:floor"]) {
      const r = await resolveCheckoutCollectOrRefuse(
        asAdmin({ rpc: async () => { throw new Error("must not read"); } }),
        input({ sourceChannel }),
      );
      assert.deepEqual(r, { ok: true, baseCollectCents: 10_000, collectCents: 10_000, serviceFeeBpsByParty: {} });
    }
  });

  test("pay in person and free orders skip the fee read", async () => {
    const boom = asAdmin({ rpc: async () => { throw new Error("must not read"); } });
    assert.equal((await resolveCheckoutCollectOrRefuse(boom, input({ payInPerson: true }))).ok, true);
    assert.equal((await resolveCheckoutCollectOrRefuse(boom, input({ collect: "none" }))).ok, true);
  });
});

describe("the fee is frozen when an inquiry offer is sent", () => {
  const modeRpc = (data: unknown, error: unknown = null) => async (fn: string) => (fn === "engine_platform_processing_mode" ? { data, error } : { data: null, error: null });
  const migratedRow = { processing_mode: "pass_through", pass_through_take_bps: 150, plan_service_fee_bps: { agency: 300 } };

  function fakeSb(rpc: ReturnType<typeof modeRpc>, writes: Array<Record<string, unknown>>) {
    const tableRows: Record<string, unknown> = {
      inquiry_participants: [{ talent_profile_id: "tal-1", owning_party_type: "workspace", owning_party_id: "ws-1" }],
      agencies: { plan_tier: "agency", workspace_type: "agency" },
    };
    return {
      rpc,
      from(table: string) {
        const q: Record<string, unknown> = {};
        const chain = () => q;
        Object.assign(q, {
          select: chain,
          eq: chain,
          update: (payload: Record<string, unknown>) => {
            writes.push({ table, ...payload });
            return { eq: () => ({ eq: async () => ({ error: null }) }) };
          },
          maybeSingle: async () => ({ data: tableRows[table] ?? null, error: null }),
          then: (res: (v: unknown) => unknown) => Promise.resolve({ data: tableRows[table], error: null }).then(res),
        });
        return q;
      },
    };
  }

  test("on: writes the fee of each seller's current plan on the offer", async () => {
    const writes: Array<Record<string, unknown>> = [];
    const r = await freezeOfferServiceFee(asAdmin(fakeSb(modeRpc(migratedRow), writes)), { inquiryId: "i1", tenantId: "t1", offerId: "o1" });
    assert.deepEqual(r, { ok: true, frozen: true });
    assert.deepEqual(writes, [{ table: "inquiry_offers", service_fee_by_party: { "ws-1": 300 } }]);
  });

  test("off (no row / included / kill switch): nothing written", async () => {
    for (const data of [null, { processing_mode: "included", pass_through_take_bps: 150 }]) {
      const writes: Array<Record<string, unknown>> = [];
      const r = await freezeOfferServiceFee(asAdmin(fakeSb(modeRpc(data), writes)), { inquiryId: "i1", tenantId: "t1", offerId: "o1" });
      assert.deepEqual(r, { ok: true, frozen: false });
      assert.equal(writes.length, 0);
    }
  });

  test("a failed fee read refuses the send, with the plain retry message", async () => {
    const writes: Array<Record<string, unknown>> = [];
    const r = await freezeOfferServiceFee(asAdmin(fakeSb(modeRpc(null, { message: "boom" }), writes)), { inquiryId: "i1", tenantId: "t1", offerId: "o1" });
    assert.deepEqual(r, { ok: false, error: FEE_UNAVAILABLE_MESSAGE });
    assert.equal(writes.length, 0);
  });

  test("sendOffer refuses to send when the fee cannot be frozen", () => {
    const src = read("../inquiry/inquiry-engine-offers.ts");
    const freeze = src.indexOf("freezeOfferServiceFee(supabase");
    const rpc = src.indexOf('supabase.rpc("engine_send_offer"');
    assert.ok(freeze > 0 && rpc > freeze, "the freeze runs before the offer is sent");
    assert.match(src, /error: "fee_unavailable"/);
  });
});

describe("cancel and refund: decided once at cancel time", () => {
  test("seller side always returns the fee; a client inside the free window returns it; a late client keeps it", () => {
    for (const by of ["talent", "staff", "system"]) assert.equal(serviceFeeRefundableOnCancel({ by, lateCancel: true }), true, by);
    assert.equal(serviceFeeRefundableOnCancel({ by: "client", lateCancel: false }), true);
    assert.equal(serviceFeeRefundableOnCancel({ by: "client", lateCancel: true }), false);
    assert.equal(serviceFeeRefundableOnCancel({ by: "customer", lateCancel: true }), false);
    assert.equal(serviceFeeRefundableOnCancel({ by: "mystery", lateCancel: false }), false);
  });

  const snap = { processing_mode: "pass_through" as const, processing_fee_payer: "client" as const, client_surcharge_cents: 150, client_processing_fee_cents: 320 };
  test("the stored decision wins over the actor: a free-window client cancel returns the surcharge, a late one keeps it", () => {
    assert.equal(nonRefundableFeeCents([snap], { cancelledBy: "client", feeRefundable: true }), 320);
    assert.equal(nonRefundableFeeCents([snap], { cancelledBy: "client", feeRefundable: false }), 470);
    assert.equal(nonRefundableFeeCents([snap], { cancelledBy: "talent", feeRefundable: false }), 470);
  });
  test("undecided (older bookings) falls back to who cancelled; unknown keeps the fee", () => {
    assert.equal(nonRefundableFeeCents([snap], { cancelledBy: "talent", feeRefundable: null }), 320);
    assert.equal(nonRefundableFeeCents([snap], { cancelledBy: "client", feeRefundable: null }), 470);
    assert.equal(nonRefundableFeeCents([snap], {}), 470);
  });

  test("the cancel path persists the decision, and the refund paths read it", async () => {
    assert.match(read("../scheduling/cancel-booking.ts"), /service_fee_refundable: serviceFeeRefundableOnCancel\(/);
    assert.deepEqual(
      await loadBookingCancelContext(
        { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { cancelled_by: "client", service_fee_refundable: true }, error: null }) }) }) }) },
        "b1",
      ),
      { cancelledBy: "client", feeRefundable: true },
    );
    assert.deepEqual(await loadBookingCancelContext({ from: () => { throw new Error("db"); } }, "b1"), { cancelledBy: null, feeRefundable: null });
  });

  test("a client who asks the desk to cancel is recorded as the client, never as staff", () => {
    const src = read("../server-actions/messaging-sheets.ts");
    assert.match(src, /requestedBy\?: "client" \| "seller"/);
    assert.match(src, /by: parsed\.data\.requestedBy === "client" \? "client" : "staff"/);
  });
});
