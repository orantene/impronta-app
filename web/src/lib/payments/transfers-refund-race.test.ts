/**
 * TUL-1746: a refund must never change what an already-paid leg paid, and a refund that Stripe has
 * issued but our ledger has not recorded yet must hold the payout.
 *
 * #4345 nets refunds out of the payout legs, so the amount a re-run computes can now DIFFER from the
 * amount already sent under the SAME per-leg Stripe idempotency key (`transfer_<booking>_<participant>_<party>`).
 * Stripe then either rejects the call (key reused with different parameters) or, once its 24h
 * idempotency window has lapsed, creates a SECOND transfer: the talent is paid twice.
 *
 * Fix: (1) the booking_payouts ledger is the truth for "already paid": a leg it shows as
 * transferred is never recomputed or re-sent, on any re-run. The key stays stable on purpose: putting
 * the netted amount in it would turn a refund race into a second transfer. (2) Our refund rows are only
 * written when Stripe's webhook lands, so in that window the DB cannot see a refund. Stripe's
 * charge.amount_refunded can: when it is ahead of our rows (or unreadable) the payout is HELD, zero legs
 * with a "refund pending" reason that the held-payout retry cron picks up.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { executeBookingTransfers } from "@/lib/payments/transfers";

const BALANCE = "txn_balance";
const DEPOSIT = "txn_deposit";
const BOOKING = "bk_1";

type TxnRow = {
  id: string;
  status: string;
  gross_amount_cents: number;
  refund_of_transaction_id: string | null;
  provider?: string;
  provider_metadata?: Record<string, unknown> | null;
};

type Snap = {
  booking_id: string;
  participant_id: string;
  owning_party_type: "talent" | "agency";
  owning_party_id: string;
  talent_net_cents: number;
  workspace_fee_cents: number;
  platform_fee_cents: number;
  gross_charged_cents: number;
  currency_code: string;
  channel_referral_cents?: number;
  channel_referral_party_id?: string | null;
};

type LedgerWrite = { op: "insert" | "update"; row: Record<string, unknown> };

/** Fake Supabase. `legs` maps "participant:party" to the ledger status already on file. */
function makeSupabase(opts: {
  rows: TxnRow[];
  snapshots: Snap[];
  legs?: Record<string, string>;
  ledger?: LedgerWrite[];
  balanceMeta?: Record<string, unknown>;
}): SupabaseClient {
  const make = (table: string) => {
    const filters: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string, val: unknown) => ((filters[col] = val), chain),
      in: () => chain,
      insert: (row: Record<string, unknown>) => {
        if (table === "booking_payouts") opts.ledger?.push({ op: "insert", row });
        return Promise.resolve({ data: null, error: null });
      },
      update: (row: Record<string, unknown>) => {
        if (table === "booking_payouts") opts.ledger?.push({ op: "update", row });
        return chain;
      },
      order: () =>
        Promise.resolve({ data: table === "booking_commission_snapshot" ? opts.snapshots : [], error: null }),
      maybeSingle: () => {
        if (table === "booking_transactions") {
          return Promise.resolve({
            data: { id: BALANCE, booking_id: BOOKING, status: "paid", currency: "usd", provider_metadata: opts.balanceMeta ?? null },
            error: null,
          });
        }
        if (table === "inquiry_participants") return Promise.resolve({ data: { talent_profile_id: "tp1" }, error: null });
        if (table === "booking_payouts") {
          const status = opts.legs?.[`${String(filters.participant_id)}:${String(filters.party)}`];
          return Promise.resolve({ data: status ? { id: "leg", status, attempts: 0, release_after: null } : null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
        resolve({ data: table === "booking_transactions" ? opts.rows : [], error: null }),
    };
    return chain;
  };
  return { from: (table: string) => make(table) } as unknown as SupabaseClient;
}

type TransferCall = { amount: number; idempotencyKey?: string };

/**
 * Fake Stripe with STRICT idempotency: the same key with different parameters throws, and
 * `expireIdempotencyKeys()` simulates Stripe's 24h window lapsing (a replay then creates a new transfer).
 * `refunded` is what Stripe reports as amount_refunded per payment intent; `retrieveFails` throws.
 */
function makeStripe(opts: { refunded?: Record<string, number>; retrieveFails?: boolean } = {}) {
  const calls: TransferCall[] = [];
  const retrieves: string[] = [];
  const seen = new Map<string, { id: string; amount: number }>();
  const client = {
    transfers: {
      create: async (params: { amount: number }, options?: { idempotencyKey?: string }) => {
        const key = options?.idempotencyKey;
        const prior = key ? seen.get(key) : undefined;
        if (prior) {
          if (prior.amount !== params.amount) throw new Error("Keys for idempotent requests can only be used with the same parameters");
          return { id: prior.id };
        }
        const transfer = { id: `tr_${calls.length + 1}`, amount: params.amount };
        calls.push({ amount: params.amount, idempotencyKey: key });
        if (key) seen.set(key, transfer);
        return { id: transfer.id };
      },
    },
    paymentIntents: {
      retrieve: async (id: string) => {
        retrieves.push(id);
        if (opts.retrieveFails) throw new Error("stripe unreachable");
        return { id, latest_charge: { amount_refunded: opts.refunded?.[id] ?? 0 } };
      },
    },
  };
  return {
    calls,
    retrieves,
    expireIdempotencyKeys: () => seen.clear(),
    stripe: client as unknown as Stripe,
  };
}

const TALENT_SNAP: Snap = {
  booking_id: BOOKING,
  participant_id: "p1",
  owning_party_type: "talent",
  owning_party_id: "tp1",
  talent_net_cents: 80000,
  workspace_fee_cents: 0,
  platform_fee_cents: 20000,
  gross_charged_cents: 100000,
  currency_code: "usd",
};
const AGENCY_SNAP: Snap = { ...TALENT_SNAP, owning_party_type: "agency", owning_party_id: "tenant_1", talent_net_cents: 60000, workspace_fee_cents: 20000 };

const BAL = (extra: Partial<TxnRow> = {}): TxnRow => ({
  id: BALANCE, status: "paid", gross_amount_cents: 70000, refund_of_transaction_id: null,
  provider: "stripe", provider_metadata: { payment_intent_id: "pi_balance" }, ...extra,
});
const DEP = (extra: Partial<TxnRow> = {}): TxnRow => ({
  id: DEPOSIT, status: "paid", gross_amount_cents: 30000, refund_of_transaction_id: null,
  provider: "stripe", provider_metadata: { payment_intent_id: "pi_deposit" }, ...extra,
});

type Run = {
  rows: TxnRow[];
  snap?: Snap;
  legs?: Record<string, string>;
  stripe: Stripe;
  ledger?: LedgerWrite[];
  skipTransferredLegs?: boolean;
};
const run = (r: Run) =>
  executeBookingTransfers(BALANCE, {
    sb: makeSupabase({ rows: r.rows, snapshots: [r.snap ?? TALENT_SNAP], legs: r.legs, ledger: r.ledger, balanceMeta: { payment_intent_id: "pi_balance" } }),
    stripe: r.stripe,
    resolveTalentAccount: async () => "acct_talent",
    resolveWorkspaceAccount: async () => "acct_ws",
    skipTransferredLegs: r.skipTransferredLegs,
  });

// ── 1. The exposure: a refund lands AFTER the first transfer ─────────────────

test("a refund landing after the first transfer: the re-run sends nothing, even once Stripe's 24h key window has lapsed", async () => {
  const s = makeStripe();
  // First run, no refunds: pays the full 80000 under the leg key.
  await run({ rows: [DEP(), BAL()], stripe: s.stripe });
  assert.deepEqual(s.calls.map((c) => c.amount), [80000]);

  // The deposit is then refunded. The ledger now says the leg is transferred.
  const afterRefund = [DEP({ status: "refunded" }), BAL()];
  const legs = { "p1:talent": "transferred" };

  // Within 24h: used to throw at Stripe (same key, different amount) and record a failure.
  const within = await run({ rows: afterRefund, legs, stripe: s.stripe });
  assert.deepEqual(s.calls.map((c) => c.amount), [80000], "no second transfer within the window");
  assert.ok(!within.some((o) => o.party === "talent" && o.status === "failed"), "and no spurious failure");

  // After 24h the key is gone: this used to create a SECOND transfer of 56000 (talent paid twice).
  s.expireIdempotencyKeys();
  await run({ rows: afterRefund, legs, stripe: s.stripe });
  assert.deepEqual(s.calls.map((c) => c.amount), [80000], "no second transfer after the window either");
});

test("the same holds for the workspace leg and the channel referral leg", async () => {
  const s = makeStripe();
  const snap: Snap = { ...AGENCY_SNAP, channel_referral_cents: 5000, channel_referral_party_id: "tenant_channel" };
  const legs = { "p1:talent": "transferred", "p1:workspace": "transferred", "p1:channel_referral": "transferred" };
  await run({ rows: [DEP({ status: "refunded" }), BAL()], snap, legs, stripe: s.stripe });
  assert.equal(s.calls.length, 0);
});

test("a leg that is NOT yet transferred still pays, net of refunds known now", async () => {
  const s = makeStripe();
  await run({ rows: [DEP({ status: "refunded" }), BAL()], legs: { "p1:talent": "held" }, stripe: s.stripe });
  assert.deepEqual(s.calls.map((c) => c.amount), [56000]);
});

test("a first payout with no ledger leg is unchanged (regression)", async () => {
  const s = makeStripe();
  await run({ rows: [DEP(), BAL()], stripe: s.stripe });
  assert.deepEqual(s.calls.map((c) => c.amount), [80000]);
  assert.equal(s.calls[0]?.idempotencyKey, `transfer_${BOOKING}_p1_talent`);
});

test("the key stays stable and never carries the amount (an amount in the key would turn a refund race into a second transfer)", () => {
  const src = readFileSync(join(__dirname, "disburse.ts"), "utf8");
  const fn = src.slice(src.indexOf("export function connectIdempotencyKey"), src.indexOf("export function outboundIdempotencyKey"));
  assert.match(fn, /return `transfer_\$\{bookingId\}_\$\{participantId\}_\$\{party\}`;/);
  assert.ok(!/amount/i.test(fn));
});

// ── 2. The pending window: Stripe has refunded, our rows have not caught up ──

test("a refund Stripe has issued but our ledger has not recorded: the payout is HELD, nothing transfers", async () => {
  const s = makeStripe({ refunded: { pi_balance: 0, pi_deposit: 15000 } });
  const ledger: LedgerWrite[] = [];
  const outcomes = await run({ rows: [DEP(), BAL()], stripe: s.stripe, ledger });
  assert.equal(s.calls.length, 0, "no money moves while a refund is in flight");
  const talent = outcomes.filter((o) => o.party === "talent");
  assert.equal(talent.length, 1);
  assert.equal(talent[0]?.status, "skipped_refund_pending");
  assert.equal(talent[0]?.amountCents, 0);
  const held = ledger.find((w) => w.row.status === "held");
  assert.ok(held, "a held leg is recorded");
  assert.equal(held?.row.amount_cents, 0);
  assert.match(String(held?.row.last_error), /^refund pending/);
});

test("the booking's other charge counts too: a pending refund on the DEPOSIT holds the balance payout", async () => {
  const s = makeStripe({ refunded: { pi_deposit: 30000 } });
  await run({ rows: [DEP(), BAL()], stripe: s.stripe });
  assert.equal(s.calls.length, 0);
  assert.deepEqual(s.retrieves.sort(), ["pi_balance", "pi_deposit"]);
});

test("Stripe's refunded amount equal to our recorded refunds: nothing is pending, the payout pays net", async () => {
  const s = makeStripe({ refunded: { pi_deposit: 15000 } });
  await run({
    rows: [DEP(), { id: "txn_refund_1", status: "refunded", gross_amount_cents: 15000, refund_of_transaction_id: DEPOSIT }, BAL()],
    stripe: s.stripe,
  });
  assert.deepEqual(s.calls.map((c) => c.amount), [68000]);
});

test("a fully refunded charge that we already recorded is not 'pending'", async () => {
  const s = makeStripe({ refunded: { pi_deposit: 30000 } });
  await run({ rows: [DEP({ status: "refunded" }), BAL()], stripe: s.stripe });
  assert.deepEqual(s.calls.map((c) => c.amount), [56000]);
});

test("refund state that cannot be read from Stripe holds the payout (never guess)", async () => {
  const s = makeStripe({ retrieveFails: true });
  const outcomes = await run({ rows: [DEP(), BAL()], stripe: s.stripe });
  assert.equal(s.calls.length, 0);
  assert.equal(outcomes.find((o) => o.party === "talent")?.status, "skipped_refund_pending");
});

test("charges with no Stripe payment intent (manual, cash) are never checked against Stripe", async () => {
  const s = makeStripe({ retrieveFails: true });
  await run({
    rows: [DEP({ provider: "manual", provider_metadata: null }), BAL({ provider: "manual", provider_metadata: {} })],
    stripe: s.stripe,
  });
  assert.equal(s.retrieves.length, 0);
  assert.deepEqual(s.calls.map((c) => c.amount), [80000]);
});

test("a leg already paid is not touched by a refund hold (no held row, no outcome)", async () => {
  const s = makeStripe({ refunded: { pi_deposit: 15000 } });
  const ledger: LedgerWrite[] = [];
  const outcomes = await run({ rows: [DEP(), BAL()], legs: { "p1:talent": "transferred" }, stripe: s.stripe, ledger });
  assert.equal(s.calls.length, 0);
  assert.equal(outcomes.filter((o) => o.party === "talent").length, 0);
  assert.equal(ledger.filter((w) => w.row.status === "held").length, 0);
});

test("once the refund is recorded, the held payout pays net of it on the retry run", async () => {
  const s = makeStripe({ refunded: { pi_deposit: 15000 } });
  const rows = [DEP(), { id: "txn_refund_1", status: "refunded", gross_amount_cents: 15000, refund_of_transaction_id: DEPOSIT }, BAL()];
  await run({ rows, legs: { "p1:talent": "held" }, stripe: s.stripe, skipTransferredLegs: true });
  assert.deepEqual(s.calls.map((c) => c.amount), [68000]);
});

// ── 3. The retry cron picks refund holds up ──────────────────────────────────

test("the held-payout retry reads refund-pending holds as well as fee-unknown ones", () => {
  const src = readFileSync(join(__dirname, "retry-fee-unknown-payouts.ts"), "utf8");
  assert.match(src, /REFUND_PENDING_ERROR_PREFIX/);
  assert.match(src, /\.or\(/);
  assert.match(src, /FEE_UNKNOWN_ERROR_PREFIX/);
});
