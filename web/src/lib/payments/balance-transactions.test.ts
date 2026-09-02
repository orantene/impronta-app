/**
 * Tests for the balance-transaction mapping.
 *
 * This is the layer that turns Stripe's numbers into our fee and FX record, so
 * the arithmetic is asserted directly rather than inferred from a happy path.
 * Getting `net` wrong here would produce a ledger that looks right and is not.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { mapBalanceTransaction } from "./balance-transactions";

type AnyTxn = Parameters<typeof mapBalanceTransaction>[0];

function txn(over: Record<string, unknown> = {}): AnyTxn {
  return {
    id: "txn_1",
    object: "balance_transaction",
    amount: 10_000,
    fee: 320,
    net: 9_680,
    currency: "usd",
    created: 1_780_000_000,
    available_on: 1_780_200_000,
    type: "charge",
    reporting_category: "charge",
    source: "ch_123",
    fee_details: [],
    ...over,
  } as unknown as AnyTxn;
}

describe("mapBalanceTransaction", () => {
  test("records gross, fee and net as three separate numbers", () => {
    const row = mapBalanceTransaction(txn(), null);
    assert.equal(row.amount_cents, 10_000);
    assert.equal(row.fee_cents, 320);
    assert.equal(row.net_cents, 9_680);
  });

  test("net is COMPUTED, not copied from Stripe's net field", () => {
    // The table has a CHECK constraint that net = amount - fee. If we copied a
    // malformed `net` straight through, the write would fail loudly at the DB
    // instead of storing a silently wrong figure — but computing it means the
    // invariant simply always holds.
    const row = mapBalanceTransaction(txn({ net: 999_999 }), null);
    assert.equal(row.net_cents, 10_000 - 320);
  });

  test("a zero-fee transaction still stores an explicit zero", () => {
    const row = mapBalanceTransaction(txn({ fee: 0, net: 10_000 }), null);
    assert.equal(row.fee_cents, 0);
    assert.equal(row.net_cents, 10_000);
  });

  test("a negative amount (refund, payout) keeps its sign", () => {
    // Refunds and payouts are negative on the balance. Coercing them positive
    // would make every total wrong in the same direction.
    const row = mapBalanceTransaction(
      txn({ amount: -5_000, fee: 0, net: -5_000, type: "refund" }),
      null,
    );
    assert.equal(row.amount_cents, -5_000);
    assert.equal(row.net_cents, -5_000);
    assert.equal(row.type, "refund");
  });

  test("currency is upper-cased to match the rest of the schema", () => {
    const row = mapBalanceTransaction(txn({ currency: "mxn" }), null);
    assert.equal(row.currency, "MXN");
  });

  test("FX fields are populated only when Stripe actually converted", () => {
    const noFx = mapBalanceTransaction(txn(), null);
    assert.equal(noFx.exchange_rate, null);
    assert.equal(noFx.presented_currency, null);

    const withFx = mapBalanceTransaction(txn({ exchange_rate: 17.42 }), null);
    assert.equal(withFx.exchange_rate, 17.42);
    assert.equal(withFx.presented_currency, "USD");
  });

  test("an unknown type is stored verbatim rather than coerced", () => {
    // Stripe adds transaction types. Mapping an unrecognised one onto a known
    // bucket would silently mis-file money.
    const row = mapBalanceTransaction(txn({ type: "some_future_type" }), null);
    assert.equal(row.type, "some_future_type");
  });

  test("a missing type falls back to a marker, never to a real type", () => {
    const row = mapBalanceTransaction(txn({ type: undefined }), null);
    assert.equal(row.type, "unknown");
  });

  test("the source id is extracted whether expanded or not", () => {
    assert.equal(mapBalanceTransaction(txn({ source: "ch_abc" }), null).source_id, "ch_abc");
    assert.equal(
      mapBalanceTransaction(txn({ source: { id: "ch_expanded" } }), null).source_id,
      "ch_expanded",
    );
    assert.equal(mapBalanceTransaction(txn({ source: null }), null).source_id, null);
  });

  test("timestamps become ISO strings, and a missing available_on is null", () => {
    const row = mapBalanceTransaction(txn({ available_on: null }), null);
    assert.equal(row.stripe_created_at, new Date(1_780_000_000 * 1000).toISOString());
    assert.equal(row.available_on, null);
  });

  test("fee_details are preserved so an application fee stays distinguishable", () => {
    // An application fee is our own revenue coming back, not a cost. Collapsing
    // the breakdown to a single number would lose that distinction.
    const details = [
      { type: "stripe_fee", amount: 320, currency: "usd" },
      { type: "application_fee", amount: 500, currency: "usd" },
    ];
    const row = mapBalanceTransaction(txn({ fee_details: details }), null);
    assert.deepEqual(row.fee_details, details);
  });

  test("a connected-account id is carried through when given", () => {
    assert.equal(mapBalanceTransaction(txn(), null).stripe_account_id, null);
    assert.equal(
      mapBalanceTransaction(txn(), "acct_123").stripe_account_id,
      "acct_123",
    );
  });
});
