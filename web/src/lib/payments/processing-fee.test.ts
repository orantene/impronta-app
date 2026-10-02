import { test } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { extractProcessingFee, apportionFeeCents, fetchProcessingFee } from "@/lib/payments/processing-fee";

function pi(over: {
  chargeCurrency?: string;
  btCurrency?: string;
  fee?: number;
  details?: Array<{ type: string; amount: number }>;
  rate?: number | null;
  expandedCharge?: boolean;
  expandedBt?: boolean;
}): Stripe.PaymentIntent {
  const bt = {
    id: "txn_1",
    currency: over.btCurrency ?? "usd",
    fee: over.fee ?? 324,
    fee_details: over.details ?? [],
    exchange_rate: over.rate ?? null,
  };
  const charge = {
    id: "ch_1",
    currency: over.chargeCurrency ?? "usd",
    balance_transaction: over.expandedBt === false ? "txn_1" : bt,
  };
  return { id: "pi_1", latest_charge: over.expandedCharge === false ? "ch_1" : charge } as unknown as Stripe.PaymentIntent;
}

test("same currency: reads bt.fee", () => {
  const r = extractProcessingFee(pi({ fee: 324 }));
  assert.deepEqual(r, { ok: true, feeCents: 324, currency: "usd", source: "balance_transaction" });
});

test("fee_details: Stripe fee + tax counted, our application_fee excluded", () => {
  const r = extractProcessingFee(
    pi({
      fee: 1000,
      details: [
        { type: "stripe_fee", amount: 300 },
        { type: "tax", amount: 24 },
        { type: "application_fee", amount: 676 },
      ],
    }),
  );
  assert.equal(r.ok && r.feeCents, 324);
});

test("fee in another currency converts with the exchange_rate", () => {
  // charge MXN, balance txn USD, 1 MXN = 0.05 USD => fee 2 USD(200c) = 4000c MXN
  const r = extractProcessingFee(pi({ chargeCurrency: "mxn", btCurrency: "usd", fee: 200, rate: 0.05 }));
  assert.deepEqual(r, { ok: true, feeCents: 4000, currency: "mxn", source: "balance_transaction" });
});

test("currency differs and no exchange_rate => NOT ok (hold, never guess)", () => {
  const r = extractProcessingFee(pi({ chargeCurrency: "mxn", btCurrency: "usd", fee: 200, rate: null }));
  assert.equal(r.ok, false);
});

test("unexpanded charge / balance transaction / missing PI => NOT ok", () => {
  assert.equal(extractProcessingFee(pi({ expandedCharge: false })).ok, false);
  assert.equal(extractProcessingFee(pi({ expandedBt: false })).ok, false);
  assert.equal(extractProcessingFee(null).ok, false);
});

test("fetchProcessingFee: no PI id or a Stripe error => NOT ok", async () => {
  const stripe = { paymentIntents: { retrieve: async () => { throw new Error("boom"); } } } as never;
  assert.equal((await fetchProcessingFee(stripe, null)).ok, false);
  assert.equal((await fetchProcessingFee(stripe, "pi_1")).ok, false);
});

test("apportionFeeCents sums exactly, deterministic, proportional", () => {
  assert.deepEqual(apportionFeeCents(324, [10_150]), [324]);
  const parts = apportionFeeCents(100, [1, 1, 1]);
  assert.equal(parts.reduce((a, b) => a + b, 0), 100);
  assert.deepEqual(parts, [34, 33, 33]);
  assert.deepEqual(apportionFeeCents(100, [1, 1, 1]), parts);
  assert.deepEqual(apportionFeeCents(10, [0, 0]), [10, 0]);
  assert.deepEqual(apportionFeeCents(0, [5, 5]), [0, 0]);
});
