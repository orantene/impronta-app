import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  CONNECTED_ACCOUNT_MISSING,
  CONNECTED_ACCOUNT_UNREADABLE,
  checkConnectedAccountExists,
  checkTransactionConnectedAccount,
} from "./connected-account-guard";

test("TUL-483: an account that exists passes", async () => {
  assert.deepEqual(await checkConnectedAccountExists(async (id) => ({ id }), "acct_real"), { ok: true });
});

test("TUL-483: no stored account is not this guard's call", async () => {
  const r = await checkConnectedAccountExists(async () => { throw new Error("must not be called"); }, "  ");
  assert.deepEqual(r, { ok: true, skipped: "no_account" });
});

test("TUL-483: 'No such destination' / resource_missing refuses with the missing code", async () => {
  for (const err of [
    Object.assign(new Error("No such destination: 'acct_1UMW'"), { code: "resource_missing" }),
    new Error("No such account: acct_x"),
    Object.assign(new Error("not found"), { statusCode: 404 }),
  ]) {
    const r = await checkConnectedAccountExists(async () => { throw err; }, "acct_gone");
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, CONNECTED_ACCOUNT_MISSING);
  }
});

test("TUL-483: any other error fails closed as unreadable, and never leaks the Stripe text", async () => {
  const r = await checkConnectedAccountExists(async () => { throw new Error("rate limited, key sk_test_secret"); }, "acct_x");
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.code, CONNECTED_ACCOUNT_UNREADABLE);
    assert.doesNotMatch(r.message, /sk_test|rate/);
  }
});

test("TUL-483: no Stripe client for a seller that has an account fails closed", async () => {
  const r = await checkConnectedAccountExists(null, "acct_x");
  assert.equal(r.ok, false);
});

test("TUL-483: a mismatched id from Stripe is treated as missing", async () => {
  const r = await checkConnectedAccountExists(async () => ({ id: "acct_other" }), "acct_x");
  assert.equal(r.ok, false);
});

type Row = Record<string, unknown> | null;
type FakeResult = { data: Row; error: { message: string } | null };
function fakeSb(tables: Record<string, FakeResult>): SupabaseClient {
  const from = (table: string) => {
    const result = tables[table] ?? { data: null, error: null };
    const q = { select: () => q, eq: () => q, maybeSingle: async () => result };
    return q;
  };
  return { from } as unknown as SupabaseClient;
}

test("TUL-483: checkout refuses a receiver whose account is gone on this platform", async () => {
  const sb = fakeSb({
    booking_transactions: { data: { payout_receiver_id: "pa_1" }, error: null },
    payout_accounts: { data: { provider_account_id: "acct_other_platform" }, error: null },
  });
  const r = await checkTransactionConnectedAccount(sb, async () => { throw Object.assign(new Error("No such destination"), { code: "resource_missing" }); }, "tx_1");
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.code, CONNECTED_ACCOUNT_MISSING);
});

test("TUL-483: checkout passes a real receiver account and the no-receiver lane", async () => {
  const real = fakeSb({
    booking_transactions: { data: { payout_receiver_id: "pa_1" }, error: null },
    payout_accounts: { data: { provider_account_id: "acct_real" }, error: null },
  });
  assert.deepEqual(await checkTransactionConnectedAccount(real, async (id) => ({ id }), "tx_1"), { ok: true });
  const none = fakeSb({ booking_transactions: { data: { payout_receiver_id: null }, error: null } });
  assert.deepEqual(await checkTransactionConnectedAccount(none, async () => { throw new Error("must not be called"); }, "tx_2"), { ok: true, skipped: "no_account" });
});

test("TUL-483: a DB read error fails closed", async () => {
  const sb = fakeSb({ booking_transactions: { data: null, error: { message: "boom" } } });
  const r = await checkTransactionConnectedAccount(sb, async (id) => ({ id }), "tx_1");
  assert.equal(r.ok === false && r.code, CONNECTED_ACCOUNT_UNREADABLE);
  assert.equal((await checkTransactionConnectedAccount(null, async (id) => ({ id }), "tx_1")).ok, false);
});
