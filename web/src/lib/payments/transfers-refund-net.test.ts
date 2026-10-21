/**
 * TUL-1294: the balance payout is net of charges already refunded.
 *
 * Deposit 30000 + balance 70000 on a 100000 booking; the talent's frozen net is
 * 80000. If the deposit was refunded before the balance paid, the talent must
 * not be paid the share of that deposit (30%): 80000 - 24000 = 56000.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { executeBookingTransfers } from "@/lib/payments/transfers";

const BALANCE_TXN = "txn_balance";
const BOOKING_ID = "bk_1";

type TxnRow = {
  id: string;
  status: string;
  gross_amount_cents: number;
  refund_of_transaction_id: string | null;
};

type Snap = {
  booking_id: string;
  participant_id: string;
  owning_party_type: "talent";
  owning_party_id: string;
  talent_net_cents: number;
  workspace_fee_cents: number;
  platform_fee_cents: number;
  gross_charged_cents: number;
  currency_code: string;
};

type Chain = {
  select: () => Chain;
  eq: () => Chain;
  in: () => Chain;
  insert: () => Promise<{ data: null; error: null }>;
  update: () => Chain;
  order: () => Promise<{ data: unknown; error: null }>;
  maybeSingle: () => Promise<{ data: unknown; error: null }>;
  then: (resolve: (v: { data: unknown; error: null }) => unknown) => unknown;
};

function makeSupabase(rows: TxnRow[], snapshots: Snap[]): SupabaseClient {
  const make = (table: string): Chain => {
    const chain: Chain = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      insert: () => Promise.resolve({ data: null, error: null }),
      update: () => chain,
      order: () =>
        Promise.resolve({ data: table === "booking_commission_snapshot" ? snapshots : [], error: null }),
      maybeSingle: () =>
        Promise.resolve({
          data:
            table === "booking_transactions"
              ? { id: BALANCE_TXN, booking_id: BOOKING_ID, status: "paid", currency: "usd" }
              : table === "inquiry_participants"
                ? { talent_profile_id: "tp1" }
                : null,
          error: null,
        }),
      // `await sb.from("booking_transactions").select().eq("booking_id", ..)` (list read)
      then: (resolve) => resolve({ data: table === "booking_transactions" ? rows : [], error: null }),
    };
    return chain;
  };
  return { from: (table: string) => make(table) } as unknown as SupabaseClient;
}

type TransferCall = { amount: number; idempotencyKey?: string };

function makeStripe(): { calls: TransferCall[]; stripe: Stripe } {
  const calls: TransferCall[] = [];
  const seen = new Map<string, { id: string }>();
  const client = {
    transfers: {
      create: async (params: { amount: number }, options?: { idempotencyKey?: string }) => {
        const key = options?.idempotencyKey;
        const prior = key ? seen.get(key) : undefined;
        if (prior) return prior;
        const transfer = { id: `tr_${calls.length + 1}` };
        calls.push({ amount: params.amount, idempotencyKey: key });
        if (key) seen.set(key, transfer);
        return transfer;
      },
    },
  };
  return { calls, stripe: client as unknown as Stripe };
}

const SNAP: Snap = {
  booking_id: BOOKING_ID,
  participant_id: "p1",
  owning_party_type: "talent",
  owning_party_id: "tp1",
  talent_net_cents: 80000,
  workspace_fee_cents: 0,
  platform_fee_cents: 20000,
  gross_charged_cents: 100000,
  currency_code: "usd",
};

const BALANCE: TxnRow = { id: BALANCE_TXN, status: "paid", gross_amount_cents: 70000, refund_of_transaction_id: null };

async function run(rows: TxnRow[], stripe: Stripe) {
  return executeBookingTransfers(BALANCE_TXN, {
    sb: makeSupabase(rows, [SNAP]),
    stripe,
    resolveTalentAccount: async () => "acct_talent",
    resolveWorkspaceAccount: async () => "acct_ws",
  });
}

test("fully refunded deposit: talent is not paid the deposit's share", async () => {
  const { calls, stripe } = makeStripe();
  const outcomes = await run(
    [
      { id: "txn_deposit", status: "refunded", gross_amount_cents: 30000, refund_of_transaction_id: null },
      BALANCE,
    ],
    stripe,
  );
  const talent = outcomes.filter((o) => o.party === "talent");
  assert.equal(talent.length, 1);
  assert.equal(talent[0]?.amountCents, 56000);
  assert.deepEqual(calls.map((c) => c.amount), [56000]);
});

test("partially refunded deposit: only the refunded slice of the deposit is netted", async () => {
  const { calls, stripe } = makeStripe();
  await run(
    [
      { id: "txn_deposit", status: "paid", gross_amount_cents: 30000, refund_of_transaction_id: null },
      { id: "txn_refund_1", status: "refunded", gross_amount_cents: 15000, refund_of_transaction_id: "txn_deposit" },
      BALANCE,
    ],
    stripe,
  );
  // 15000 of 100000 refunded -> 80000 - 12000
  assert.deepEqual(calls.map((c) => c.amount), [68000]);
});

test("everything charged was refunded: pays 0, never negative", async () => {
  const { calls, stripe } = makeStripe();
  const outcomes = await run(
    [
      { id: "txn_deposit", status: "refunded", gross_amount_cents: 100000, refund_of_transaction_id: null },
      { ...BALANCE, gross_amount_cents: 0 },
    ],
    stripe,
  );
  assert.equal(calls.length, 0);
  assert.ok(outcomes.every((o) => o.amountCents >= 0));
  assert.equal(outcomes.filter((o) => o.party === "talent" && o.amountCents > 0).length, 0);
});

test("no refunds: unchanged full snapshot net", async () => {
  const { calls, stripe } = makeStripe();
  await run(
    [{ id: "txn_deposit", status: "paid", gross_amount_cents: 30000, refund_of_transaction_id: null }, BALANCE],
    stripe,
  );
  assert.deepEqual(calls.map((c) => c.amount), [80000]);
});

test("replay is idempotent: same netted amount, same key, one transfer", async () => {
  const { calls, stripe } = makeStripe();
  const rows: TxnRow[] = [
    { id: "txn_deposit", status: "refunded", gross_amount_cents: 30000, refund_of_transaction_id: null },
    BALANCE,
  ];
  await run(rows, stripe);
  await run(rows, stripe);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.amount, 56000);
});
