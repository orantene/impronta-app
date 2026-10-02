/**
 * executeBookingTransfers — processing_mode = 'pass_through'.
 *
 * The frozen snapshot is PROVISIONAL (talent_net before the processing fee).
 * The payout step must read the REAL fee from the charge's balance transaction
 * and pay talent_net - fee, once (idempotent), or HOLD when the fee is unknown.
 *
 * Run: npm run test:money
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { executeBookingTransfers } from "@/lib/payments/transfers";

const TXN_ID = "txn_pt_1";
const BOOKING_ID = "bk_pt_1";
const TENANT = "tenant_pt_1";

type Snap = Record<string, unknown>;
type LedgerWrite = { op: "insert" | "update"; row: Record<string, unknown> };

function makeSupabase(opts: {
  snapshots: Snap[];
  ledger: LedgerWrite[];
  transferredLegs?: string[]; // `${participant}:${party}` already transferred
}): SupabaseClient {
  const make = (table: string) => {
    const eqs: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string, val: unknown) => {
        eqs[col] = val;
        return chain;
      },
      in: () => chain,
      insert: (row: Record<string, unknown>) => {
        if (table === "booking_payouts") opts.ledger.push({ op: "insert", row });
        return Promise.resolve({ data: null, error: null });
      },
      update: (row: Record<string, unknown>) => {
        if (table === "booking_payouts") opts.ledger.push({ op: "update", row });
        return chain;
      },
      order: () =>
        Promise.resolve(
          table === "booking_commission_snapshot"
            ? { data: opts.snapshots, error: null }
            : { data: [], error: null },
        ),
      maybeSingle: () => {
        if (table === "booking_transactions") {
          return Promise.resolve({
            data: {
              id: TXN_ID,
              booking_id: BOOKING_ID,
              status: "paid",
              currency: "usd",
              provider_metadata: { payment_intent_id: "pi_pt_1" },
            },
            error: null,
          });
        }
        if (table === "inquiry_participants") {
          return Promise.resolve({ data: { talent_profile_id: "tp_agency_talent" }, error: null });
        }
        if (table === "booking_payouts") {
          const key = `${eqs["participant_id"]}:${eqs["party"]}`;
          return Promise.resolve({
            data: opts.transferredLegs?.includes(key) ? { status: "transferred" } : null,
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      },
    };
    return chain;
  };
  return { from: (t: string) => make(t) } as unknown as SupabaseClient;
}

function makeStripe(fee: number | "throw", opts: { feeFx?: boolean } = {}) {
  const calls: { params: Record<string, unknown>; idempotencyKey?: string }[] = [];
  const seen = new Map<string, { id: string }>();
  const client = {
    paymentIntents: {
      retrieve: async () => {
        if (fee === "throw") throw new Error("stripe down");
        return {
          id: "pi_pt_1",
          latest_charge: {
            id: "ch_1",
            currency: "usd",
            balance_transaction: {
              id: "txn_bt",
              currency: opts.feeFx ? "mxn" : "usd",
              fee: opts.feeFx ? fee * 20 : fee,
              fee_details: [],
              exchange_rate: opts.feeFx ? 20 : null,
            },
          },
        };
      },
    },
    transfers: {
      create: async (params: Record<string, unknown>, options?: { idempotencyKey?: string }) => {
        const key = options?.idempotencyKey;
        if (key && seen.has(key)) return seen.get(key);
        const t = { id: `tr_${calls.length + 1}` };
        calls.push({ params, idempotencyKey: key });
        if (key) seen.set(key, t);
        return t;
      },
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { calls, stripe: client as any };
}

const talentSnap = (over: Snap = {}): Snap => ({
  booking_id: BOOKING_ID,
  participant_id: "p1",
  owning_party_type: "talent",
  owning_party_id: "tp1",
  talent_net_cents: 10_000,
  workspace_fee_cents: 0,
  platform_fee_cents: 150,
  gross_charged_cents: 10_150,
  currency_code: "usd",
  payment_method: "card",
  processing_mode: "pass_through",
  ...over,
});

const baseDeps = {
  resolveTalentAccount: async (tp: string) => `acct_${tp}`,
  resolveWorkspaceAccount: async (t: string) => `acct_${t}`,
  resolvePayoutRail: () => "connect_transfer" as const,
};

test("independent talent: paid subtotal minus the REAL fee ($100 -> $96.76), ledger records the fee", async () => {
  const { calls, stripe } = makeStripe(324);
  const ledger: LedgerWrite[] = [];
  const outcomes = await executeBookingTransfers(TXN_ID, {
    ...baseDeps,
    sb: makeSupabase({ snapshots: [talentSnap()], ledger }),
    stripe,
  });
  assert.equal(outcomes.length, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.params.amount, 9_676);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0]?.row.amount_cents, 9_676);
  assert.equal(ledger[0]?.row.processing_fee_cents, 324);
  assert.equal(ledger[0]?.row.status, "transferred");
});

test("re-delivered webhook: same keyed transfer, no second payment, same amount", async () => {
  const { calls, stripe } = makeStripe(324);
  const run = () =>
    executeBookingTransfers(TXN_ID, {
      ...baseDeps,
      sb: makeSupabase({ snapshots: [talentSnap()], ledger: [] }),
      stripe,
    });
  await run();
  await run();
  assert.equal(calls.length, 1, "replay created no new transfer");
});

test("a leg already 'transferred' is never recomputed or re-sent (even if the fee read changed)", async () => {
  const { calls, stripe } = makeStripe(999);
  await executeBookingTransfers(TXN_ID, {
    ...baseDeps,
    sb: makeSupabase({ snapshots: [talentSnap()], ledger: [], transferredLegs: ["p1:talent"] }),
    stripe,
  });
  assert.equal(calls.length, 0);
});

test("fee unknown: leg is HELD with a 0 placeholder, NOTHING is transferred, never paid pre-fee", async () => {
  const { calls, stripe } = makeStripe("throw");
  const ledger: LedgerWrite[] = [];
  const outcomes = await executeBookingTransfers(TXN_ID, {
    ...baseDeps,
    sb: makeSupabase({ snapshots: [talentSnap()], ledger }),
    stripe,
  });
  assert.equal(calls.length, 0);
  assert.equal(outcomes[0]?.status, "skipped_fee_unknown");
  assert.equal(ledger[0]?.row.status, "held");
  assert.equal(ledger[0]?.row.amount_cents, 0);
  assert.match(String(ledger[0]?.row.last_error), /processing fee unavailable/);
});

test("fee in another currency converts via exchange_rate (fee 324c USD charge, bt in MXN at 20)", async () => {
  const { calls, stripe } = makeStripe(324, { feeFx: true });
  await executeBookingTransfers(TXN_ID, {
    ...baseDeps,
    sb: makeSupabase({ snapshots: [talentSnap()], ledger: [] }),
    stripe,
  });
  assert.equal(calls[0]?.params.amount, 9_676);
});

test("workspace seller: talent paid the full quote, workspace margin net of the fee", async () => {
  const { calls, stripe } = makeStripe(324);
  const snapshots = [
    talentSnap({
      owning_party_type: "agency",
      owning_party_id: TENANT,
      talent_net_cents: 8_000,
      workspace_fee_cents: 2_000,
    }),
  ];
  const ledger: LedgerWrite[] = [];
  await executeBookingTransfers(TXN_ID, {
    ...baseDeps,
    resolveTalentAccount: async () => "acct_talent",
    sb: makeSupabase({ snapshots, ledger }),
    stripe,
  });
  const byParty = Object.fromEntries(
    calls.map((c) => [(c.params.metadata as Record<string, string>).party, c.params.amount]),
  );
  assert.equal(byParty.talent, 8_000);
  assert.equal(byParty.workspace, 1_676);
});

test("thin workspace margin: workspace leg is 0 (skipped), talent still whole, platform absorbs", async () => {
  const { calls, stripe } = makeStripe(324);
  const snapshots = [
    talentSnap({
      owning_party_type: "agency",
      owning_party_id: TENANT,
      talent_net_cents: 9_900,
      workspace_fee_cents: 100,
    }),
  ];
  await executeBookingTransfers(TXN_ID, {
    ...baseDeps,
    resolveTalentAccount: async () => "acct_talent",
    sb: makeSupabase({ snapshots, ledger: [] }),
    stripe,
  });
  assert.equal(calls.length, 1);
  assert.equal((calls[0]?.params.metadata as Record<string, string>).party, "talent");
  assert.equal(calls[0]?.params.amount, 9_900);
});

test("two participants share one PaymentIntent: fee is apportioned by gross and sums exactly", async () => {
  const { calls, stripe } = makeStripe(301);
  const snapshots = [
    talentSnap({ participant_id: "pA", owning_party_id: "tpA", talent_net_cents: 10_000, gross_charged_cents: 10_150 }),
    talentSnap({ participant_id: "pB", owning_party_id: "tpB", talent_net_cents: 20_000, platform_fee_cents: 300, gross_charged_cents: 20_300 }),
  ];
  await executeBookingTransfers(TXN_ID, { ...baseDeps, sb: makeSupabase({ snapshots, ledger: [] }), stripe });
  assert.equal(calls.length, 2);
  const paid = calls.reduce((s, c) => s + (c.params.amount as number), 0);
  assert.equal(paid, 30_000 - 301);
});

test("payer='client': seller paid exactly the snapshot, the PaymentIntent is NEVER read", async () => {
  const { calls, stripe } = makeStripe("throw"); // any fee read would fail the leg
  await executeBookingTransfers(TXN_ID, {
    ...baseDeps,
    sb: makeSupabase({
      snapshots: [talentSnap({ processing_fee_payer: "client", gross_charged_cents: 10_484, platform_fee_cents: 150 })],
      ledger: [],
    }),
    stripe,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.params.amount, 10_000);
});

test("included-mode snapshot: untouched, no PaymentIntent read, full snapshot amount paid", async () => {
  const { calls, stripe } = makeStripe("throw");
  await executeBookingTransfers(TXN_ID, {
    ...baseDeps,
    sb: makeSupabase({ snapshots: [talentSnap({ processing_mode: undefined })], ledger: [] }),
    stripe,
  });
  assert.equal(calls[0]?.params.amount, 10_000);
});
