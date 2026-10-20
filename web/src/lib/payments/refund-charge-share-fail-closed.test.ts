/**
 * E5 consultant P1: the share-only payout reversal FAILS CLOSED.
 *
 * Before: a failed `booking_transactions` read (or no Supabase client) fell back
 * to the full reversal, clawing back EVERY payout leg for the refund of one
 * charge; and a failed `stripe.transfers.list` left `amount_reversed` unknown,
 * so the share was reversed blind and a later refund could claw twice.
 * After: nothing is reversed, the refunded charge is flagged for a person
 * (`metadata.needs_attention = payout_reversal_review`), and the result says
 * `needsManualReview`.
 *
 * Run: npm run test:wt -- src/lib/payments/refund-charge-share-fail-closed.test.ts
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import { reverseRefundedChargePayouts } from "./refund-charge-share";

type Row = Record<string, unknown>;
type ReadError = { message: string };
type Result = { data: unknown; error: ReadError | null };

type FakeDb = {
  client: SupabaseClient;
  tables: Record<string, Row[]>;
  updates: Array<{ table: string; patch: Row }>;
};

/**
 * Typed recording fake. `failChargeRead` makes the charge-list read on
 * `booking_transactions` (the one that selects `gross_amount_cents`) return an
 * error; every other read and write behaves.
 */
function fakeDb(seed: Record<string, Row[]>, opts: { failChargeRead?: boolean } = {}): FakeDb {
  const tables: Record<string, Row[]> = {};
  for (const [t, rows] of Object.entries(seed)) tables[t] = rows.map((r) => ({ ...r }));
  const updates: FakeDb["updates"] = [];

  const from = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    let columns = "";
    let patch: Row | null = null;
    const matches = (r: Row) => filters.every(([c, v]) => r[c] === v);
    const readResult = (): Result => {
      if (opts.failChargeRead && table === "booking_transactions" && columns.includes("gross_amount_cents")) {
        return { data: null, error: { message: "read failed" } };
      }
      return { data: (tables[table] ?? []).filter(matches), error: null };
    };
    const chain = {
      select: (cols: string) => {
        columns = cols;
        return chain;
      },
      update: (p: Row) => {
        patch = p;
        return chain;
      },
      eq: (col: string, val: unknown) => {
        filters.push([col, val]);
        return chain;
      },
      maybeSingle: (): Promise<Result> => {
        const r = readResult();
        return Promise.resolve({ data: Array.isArray(r.data) ? (r.data[0] ?? null) : null, error: r.error });
      },
      then: (resolve: (v: Result) => void) => {
        if (patch) {
          const p = patch;
          for (const r of tables[table] ?? []) if (matches(r)) Object.assign(r, p);
          updates.push({ table, patch: p });
          patch = null;
          resolve({ data: null, error: null });
          return;
        }
        resolve(readResult());
      },
    };
    return chain;
  };
  return { client: { from } as unknown as SupabaseClient, tables, updates };
}

type ReversalCall = { transferId: string; amount: number };

function fakeStripe(opts: { listThrows?: boolean } = {}): { stripe: Stripe; reversals: ReversalCall[]; lists: number } {
  const state = { reversals: [] as ReversalCall[], lists: 0 };
  const stripe = {
    transfers: {
      list: async () => {
        state.lists += 1;
        if (opts.listThrows) throw new Error("stripe list unavailable");
        return {
          data: [
            { id: "tr_t", amount: 70000, amount_reversed: 0 },
            { id: "tr_ws", amount: 24000, amount_reversed: 0 },
          ],
        };
      },
      createReversal: async (transferId: string, params: { amount: number }) => {
        state.reversals.push({ transferId, amount: params.amount });
        return { id: `trr_${state.reversals.length}` };
      },
    },
  };
  return {
    stripe: stripe as unknown as Stripe,
    get reversals() {
      return state.reversals;
    },
    get lists() {
      return state.lists;
    },
  };
}

const BOOKING = "bk_1";
const DEPOSIT = "txn_dep";

const seed = (): Record<string, Row[]> => ({
  booking_transactions: [
    { id: DEPOSIT, booking_id: BOOKING, status: "refunded", gross_amount_cents: 30000, refund_of_transaction_id: null, metadata: {} },
    { id: "txn_bal", booking_id: BOOKING, status: "paid", gross_amount_cents: 70000, refund_of_transaction_id: null, metadata: {} },
  ],
  booking_payouts: [
    { id: "L_t", booking_id: BOOKING, participant_id: "p1", party: "talent", amount_cents: 70000, status: "transferred", stripe_transfer_id: "tr_t", attempts: 1, last_error: null },
    { id: "L_ws", booking_id: BOOKING, participant_id: "p1", party: "workspace", amount_cents: 24000, status: "transferred", stripe_transfer_id: "tr_ws", attempts: 1, last_error: null },
  ],
});

const ref = { bookingId: BOOKING, transactionId: DEPOSIT, chargeAmountCents: 30000 };
const plan = { reference: "refund ch_dep", anchor: "ch_dep" };

function flagged(db: FakeDb): boolean {
  const row = db.tables.booking_transactions?.find((r) => r.id === DEPOSIT);
  const meta = (row?.metadata ?? {}) as Row;
  return meta.needs_attention === "payout_reversal_review" && typeof meta.needs_attention_note === "string";
}

const legsUntouched = (db: FakeDb) =>
  db.tables.booking_payouts?.every((l) => l.status === "transferred" && (l.amount_cents === 70000 || l.amount_cents === 24000));

test("(a) a failed charge read reverses NOTHING, asks for manual review and flags the refund", async () => {
  const db = fakeDb(seed(), { failChargeRead: true });
  const s = fakeStripe();
  const res = await reverseRefundedChargePayouts(ref, plan, { sb: db.client, stripe: s.stripe });
  assert.equal(s.reversals.length, 0, "before: the full reversal clawed back 70000 + 24000");
  assert.equal(res.needsManualReview, true);
  assert.equal(res.shareOnly, true, "the booking and order are left for the person reviewing");
  assert.deepEqual(res.outcomes, []);
  assert.ok(legsUntouched(db));
  assert.ok(flagged(db), "the refunded charge carries needs_attention = payout_reversal_review");
});

test("(b) no Supabase client reverses NOTHING and asks for manual review", async () => {
  const s = fakeStripe();
  const res = await reverseRefundedChargePayouts(ref, plan, { sb: null, stripe: s.stripe });
  assert.equal(s.reversals.length, 0);
  assert.equal(s.lists, 0);
  assert.equal(res.needsManualReview, true);
  assert.equal(res.shareOnly, true);
  assert.deepEqual(res.outcomes, []);
});

test("(c) a failed transfers.list never guesses: no reversal, legs untouched, flagged", async () => {
  const db = fakeDb(seed());
  const s = fakeStripe({ listThrows: true });
  const res = await reverseRefundedChargePayouts(ref, plan, { sb: db.client, stripe: s.stripe });
  assert.equal(s.reversals.length, 0, "before: 21000 + 7200 reversed with amount_reversed unknown");
  assert.equal(res.needsManualReview, true);
  assert.equal(res.shareOnly, true);
  assert.ok(legsUntouched(db));
  assert.ok(flagged(db));
});

test("the healthy path still reverses the share and needs no review", async () => {
  const db = fakeDb(seed());
  const s = fakeStripe();
  const res = await reverseRefundedChargePayouts(ref, plan, { sb: db.client, stripe: s.stripe });
  assert.deepEqual(s.reversals.map((r) => [r.transferId, r.amount]).sort(), [["tr_t", 21000], ["tr_ws", 7200]]);
  assert.equal(res.needsManualReview ?? false, false);
  assert.equal(flagged(db), false);
});
