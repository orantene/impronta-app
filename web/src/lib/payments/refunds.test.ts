/**
 * BEHAVIORAL TEST — recordPartialRefund (P1 hardening: event-based refund
 * idempotency).
 *
 * The partial-refund bookkeeping row is keyed on the Stripe Refund id
 * (`re_...`), persisted in `provider_refund_id` with a UNIQUE index. The bug
 * this fixed: `charge.amount_refunded` is CUMULATIVE, so amount-based dedup
 * could not tell a re-delivered `charge.refunded` event from a genuinely new
 * additive partial — each delivery inserted another clawing row (double-claw
 * of the workspace leg). Keying on the refund id makes:
 *
 *   1. a re-delivered event (SAME refund id) a no-op — returns false, NO second
 *      row inserted;
 *   2. a genuinely NEW partial (different refund id) record exactly once —
 *      returns true, with the row carrying THIS refund's own slice (not the
 *      cumulative total);
 *   3. a legacy/trimmed payload (no refund id) fall back to the prior
 *      (parent, amount, status='refunded') probe so the legacy shape still
 *      doesn't duplicate on re-delivery;
 *   4. a concurrent unique-violation (Postgres 23505) on insert treated as a
 *      benign re-delivery race → false, not an error.
 *
 * recordPartialRefund takes its Supabase client as its first argument, so this
 * drives it through a recording fake — no live DB, no Stripe, deterministic.
 *
 * The handler entry points (handleBookingRefund / handleBookingDispute /
 * reconcilePartialRefund) now ALSO take an optional RefundDeps seam (mirroring
 * transfers.ts' TransferDeps), so the second half of this file exercises the
 * full refund/dispute money path end-to-end through that seam — see
 * "refund/dispute handlers — end-to-end via the RefundDeps seam" below.
 *
 * Run: npx tsx --test src/lib/payments/refunds.test.ts
 */

import { strict as assert } from "node:assert";
import { describe, it, test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import {
  recordPartialRefund,
  handleBookingRefund,
  handleBookingDispute,
  type RefundDeps,
} from "./refunds";

const TXN_ID = "txn_parent_1";
const CHARGE_ID = "ch_1";

const PARENT_ROW = {
  id: TXN_ID,
  booking_id: "bk_1",
  source_tenant_id: "tenant_1",
  source_inquiry_id: "inq_1",
  payer_user_id: "user_payer",
  payer_email: "payer@example.com",
  payout_receiver_id: "recv_1",
  payout_receiver_kind: "agency",
  payout_receiver_display_name: "Agency One",
  currency: "usd",
  provider: "stripe",
  created_by_profile_id: "profile_creator",
};

type RecordedInsert = Record<string, unknown>;

type Filters = Record<string, unknown>;

/**
 * Recording fake for the booking_transactions table. Disambiguates the three
 * query shapes recordPartialRefund issues by the `.eq()` filters applied:
 *   • parent read     → filtered by `id`            (returns PARENT_ROW)
 *   • event-id probe  → filtered by `provider_refund_id`
 *   • legacy probe    → filtered by `refund_of_transaction_id` (+ amount/status)
 *   • insert          → captured into `inserts`
 *
 * `existingRefundIds` seeds which provider_refund_ids already exist (re-delivery
 * dedup). `existingLegacy` seeds whether the legacy (txn,amount) probe hits.
 * `insertError` injects an error the insert resolves with (e.g. 23505).
 */
function makeSupabase(opts: {
  existingRefundIds?: Set<string>;
  existingLegacy?: boolean;
  insertError?: { code?: string } | null;
  parentMissing?: boolean;
}): { sb: SupabaseClient; inserts: RecordedInsert[]; selectCount: () => number } {
  const inserts: RecordedInsert[] = [];
  let selects = 0;

  function builder() {
    const filters: Filters = {};
    let pendingInsert: RecordedInsert | null = null;

    const resolveRead = (): { data: unknown; error: null } => {
      selects += 1;
      // Insert path: insert() set pendingInsert; nothing to read back.
      if (pendingInsert) {
        return { data: null, error: null };
      }
      // Parent read — filtered by id.
      if ("id" in filters) {
        if (opts.parentMissing) return { data: null, error: null };
        return { data: { ...PARENT_ROW }, error: null };
      }
      // Event-based dedup probe — filtered by provider_refund_id.
      if ("provider_refund_id" in filters) {
        const rid = String(filters.provider_refund_id);
        const hit = opts.existingRefundIds?.has(rid) ?? false;
        return { data: hit ? { id: "existing_refund_row" } : null, error: null };
      }
      // Legacy probe — filtered by refund_of_transaction_id (+ amount + status).
      if ("refund_of_transaction_id" in filters) {
        return { data: opts.existingLegacy ? { id: "existing_legacy_row" } : null, error: null };
      }
      return { data: null, error: null };
    };

    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return chain;
      },
      insert: (row: RecordedInsert) => {
        pendingInsert = row;
        inserts.push(row);
        return Promise.resolve({ data: null, error: opts.insertError ?? null });
      },
      maybeSingle: () => Promise.resolve(resolveRead()),
      single: () => Promise.resolve(resolveRead()),
    };
    return chain;
  }

  const sb = {
    from: (table: string) => {
      if (table !== "booking_transactions") {
        throw new Error(`unexpected table in recordPartialRefund: ${table}`);
      }
      return builder();
    },
  } as unknown as SupabaseClient;

  return { sb, inserts, selectCount: () => selects };
}

describe("recordPartialRefund — event-based dedup on provider_refund_id", () => {
  it("a brand-new refund id records exactly ONE row carrying its OWN slice", async () => {
    const { sb, inserts } = makeSupabase({ existingRefundIds: new Set() });
    const ok = await recordPartialRefund(sb, TXN_ID, 2_500, CHARGE_ID, "re_new");
    assert.equal(ok, true, "a new refund id is newly recorded");
    assert.equal(inserts.length, 1, "exactly one refund row inserted");
    const row = inserts[0];
    assert.equal(row.provider_refund_id, "re_new", "keyed on the Stripe Refund id");
    // THIS refund's own slice, not a cumulative total.
    assert.equal(row.gross_amount_cents, 2_500);
    assert.equal(row.net_amount_cents, 2_500);
    assert.equal(row.platform_fee_cents, 0);
    assert.equal(row.status, "refunded");
    assert.equal(row.refund_of_transaction_id, TXN_ID);
    assert.equal(row.provider_reference, CHARGE_ID);
    // Parent linkage copied across (so the refund row reconciles).
    assert.equal(row.booking_id, PARENT_ROW.booking_id);
    assert.equal(row.currency, PARENT_ROW.currency);
  });

  it("a RE-DELIVERED event (same refund id already present) is a no-op — NO second row", async () => {
    const { sb, inserts } = makeSupabase({ existingRefundIds: new Set(["re_dup"]) });
    const ok = await recordPartialRefund(sb, TXN_ID, 2_500, CHARGE_ID, "re_dup");
    assert.equal(ok, false, "re-delivery is not newly recorded");
    assert.equal(inserts.length, 0, "no clawing row inserted on re-delivery");
  });

  it("two DIFFERENT additive partials each record once (no double-claw, distinct slices)", async () => {
    // First partial.
    const seen = new Set<string>();
    const first = makeSupabase({ existingRefundIds: seen });
    const ok1 = await recordPartialRefund(first.sb, TXN_ID, 2_500, CHARGE_ID, "re_a");
    assert.equal(ok1, true);
    assert.equal(first.inserts[0].gross_amount_cents, 2_500);
    seen.add("re_a"); // the first refund id is now persisted

    // Second, genuinely-new partial (different id) on the same charge — records
    // its OWN slice, not the cumulative 4,000.
    const second = makeSupabase({ existingRefundIds: seen });
    const ok2 = await recordPartialRefund(second.sb, TXN_ID, 1_500, CHARGE_ID, "re_b");
    assert.equal(ok2, true, "a new refund id is recorded even though the charge already had a partial");
    assert.equal(second.inserts.length, 1);
    assert.equal(second.inserts[0].gross_amount_cents, 1_500, "records its own slice, not cumulative");
    assert.equal(second.inserts[0].provider_refund_id, "re_b");

    // Re-delivery of the second event → no-op.
    seen.add("re_b");
    const replay = makeSupabase({ existingRefundIds: seen });
    const ok3 = await recordPartialRefund(replay.sb, TXN_ID, 1_500, CHARGE_ID, "re_b");
    assert.equal(ok3, false);
    assert.equal(replay.inserts.length, 0);
  });
});

describe("recordPartialRefund — legacy fallback (no refund id) + concurrency", () => {
  it("no refund id, legacy probe MISSES → records once (with a null refund id)", async () => {
    const { sb, inserts } = makeSupabase({ existingLegacy: false });
    const ok = await recordPartialRefund(sb, TXN_ID, 3_000, CHARGE_ID, null);
    assert.equal(ok, true);
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0].provider_refund_id, null, "legacy row carries no event id");
    assert.equal(inserts[0].gross_amount_cents, 3_000);
  });

  it("no refund id, legacy probe HITS (already recorded) → no-op", async () => {
    const { sb, inserts } = makeSupabase({ existingLegacy: true });
    const ok = await recordPartialRefund(sb, TXN_ID, 3_000, CHARGE_ID, null);
    assert.equal(ok, false, "the legacy (txn,amount,status) probe dedups the re-delivery");
    assert.equal(inserts.length, 0);
  });

  it("a concurrent unique-violation (23505) on insert is a benign race → false, not an error", async () => {
    const { sb, inserts } = makeSupabase({
      existingRefundIds: new Set(), // dedup probe misses (lost the race)
      insertError: { code: "23505" }, // ...but the unique index rejects the insert
    });
    const ok = await recordPartialRefund(sb, TXN_ID, 2_500, CHARGE_ID, "re_race");
    assert.equal(ok, false, "a 23505 means the row already exists → not newly recorded");
    assert.equal(inserts.length, 1, "the insert was attempted exactly once");
  });

  it("a non-zero negative / zero slice never touches the DB (guard)", async () => {
    const zero = makeSupabase({ existingRefundIds: new Set() });
    assert.equal(await recordPartialRefund(zero.sb, TXN_ID, 0, CHARGE_ID, "re_z"), false);
    assert.equal(zero.inserts.length, 0);
    assert.equal(zero.selectCount(), 0, "guard returns before any DB read");

    const neg = makeSupabase({ existingRefundIds: new Set() });
    assert.equal(await recordPartialRefund(neg.sb, TXN_ID, -100, CHARGE_ID, "re_n"), false);
    assert.equal(neg.inserts.length, 0);
  });

  it("a missing parent transaction → false, no insert (can't reconcile an orphan refund)", async () => {
    const { sb, inserts } = makeSupabase({ parentMissing: true, existingRefundIds: new Set() });
    const ok = await recordPartialRefund(sb, TXN_ID, 2_500, CHARGE_ID, "re_orphan");
    assert.equal(ok, false);
    assert.equal(inserts.length, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// refund/dispute handlers — end-to-end via the RefundDeps seam
//
// handleBookingRefund / handleBookingDispute now take an optional deps object
// ({ supabase?, stripe via the positional arg, markRefunded?, markDisputed?,
// notify* }) defaulting to the real server-only implementations — so production
// callers are unchanged but tests inject a recording Supabase fake + mock Stripe
// + no-op transition/notify stubs. This pins the money-critical flow:
//   • FULL refund  → markRefunded + every payout leg reversed (ledger-synced).
//   • PARTIAL refund → records the per-refund slice + reverses the workspace leg
//     with a UNIQUE-per-refund idempotency key.
//   • RE-DELIVERED partial (same refund id) → no 2nd clawing row + no 2nd reversal.
//   • TWO DISTINCT partials on ONE transfer → two reversals with DISTINCT keys
//     (proves Task 1: the old `reverse_partial_<transferId>` key was reused and
//     Stripe rejected the 2nd reversal).
//   • dispute.lost → full reversal; dispute.won → restore to paid.
// ─────────────────────────────────────────────────────────────────────────────

const E2E_PI = "pi_booking_1";
const E2E_CHARGE = "ch_e2e";
const E2E_TXN = "txn_e2e";
const E2E_BOOKING = "bk_e2e";

type Row = Record<string, unknown>;

type RecordingDb = {
  client: SupabaseClient;
  inserts: Array<{ table: string; row: Row }>;
  updates: Array<{ table: string; patch: Row }>;
  tables: Record<string, Row[]>;
};

/**
 * Recording Supabase fake serving the reads the handlers make and capturing
 * inserts + updates. Supports two terminal shapes: `.maybeSingle()`/`.single()`
 * resolve the matching seeded row; `.order()` or an awaited chain resolve the
 * matching row list. `.update(...).eq(...)` mutates matching rows in place;
 * `.insert(...).select().single()` returns the inserted row.
 */
function makeDb(seed: Record<string, Row[]>): RecordingDb {
  const tables: Record<string, Row[]> = {};
  for (const [t, rows] of Object.entries(seed)) tables[t] = rows.map((r) => ({ ...r }));
  const inserts: RecordingDb["inserts"] = [];
  const updates: RecordingDb["updates"] = [];

  const make = (table: string) => {
    const eqFilters: Array<[string, unknown]> = [];
    let pendingPatch: Row | null = null;
    let isDelete = false;
    const matches = (r: Row) => eqFilters.every(([c, v]) => r[c] === v);

    // Apply a pending write (update/delete) to every matching row. Called from
    // the awaited terminal, so a chained `.eq().eq()` narrows the filter set
    // before the write lands — matching PostgREST semantics.
    const applyPendingWrite = () => {
      if (pendingPatch) {
        const patch = pendingPatch;
        for (const r of tables[table] ?? []) if (matches(r)) Object.assign(r, patch);
        updates.push({ table, patch });
        pendingPatch = null;
        return true;
      }
      if (isDelete) {
        tables[table] = (tables[table] ?? []).filter((r) => !matches(r));
        return true;
      }
      return false;
    };

    const chain: Record<string, unknown> = {
      select: () => chain,
      insert: (row: Row) => {
        const rows = (tables[table] ??= []);
        const stored = { ...row };
        rows.push(stored);
        inserts.push({ table, row: stored });
        const ret: Record<string, unknown> = {
          select: () => ret,
          single: () => Promise.resolve({ data: stored, error: null }),
          maybeSingle: () => Promise.resolve({ data: stored, error: null }),
          then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
        };
        return ret;
      },
      update: (patch: Row) => {
        pendingPatch = patch;
        return chain;
      },
      delete: () => {
        isDelete = true;
        return chain;
      },
      // `.eq` always narrows the filter set and returns the chain. The write (if
      // any) is applied when the chain is awaited, so `.update(...).eq().eq()`
      // works the same as a single `.eq`.
      eq: (col: string, val: unknown) => {
        eqFilters.push([col, val]);
        return chain;
      },
      order: () => Promise.resolve({ data: (tables[table] ?? []).filter(matches), error: null }),
      maybeSingle: () => Promise.resolve({ data: (tables[table] ?? []).find(matches) ?? null, error: null }),
      single: () => {
        const found = (tables[table] ?? []).find(matches) ?? null;
        return Promise.resolve(found ? { data: found, error: null } : { data: null, error: { message: "not found" } });
      },
      then: (resolve: (v: unknown) => void) => {
        if (applyPendingWrite()) return resolve({ data: null, error: null });
        return resolve({ data: (tables[table] ?? []).filter(matches), error: null });
      },
    };
    return chain;
  };

  return { client: { from: (t: string) => make(t) } as unknown as SupabaseClient, inserts, updates, tables };
}

type ReversalCall = { transferId: string; amount: number; key?: string };

/** Mock Stripe: PI retrieve carries the booking linkage; createReversal honours
 *  the idempotency key (a re-used key replays the SAME reversal, never a 2nd). */
function makeStripe(opts?: {
  transfers?: Array<{ id: string; amount: number; amount_reversed: number }>;
  metadata?: Record<string, string>;
}) {
  const reversals: ReversalCall[] = [];
  const seenKeys = new Map<string, { id: string }>();
  const transfers = opts?.transfers ?? [];
  const metadata = opts?.metadata ?? { transaction_id: E2E_TXN, booking_id: E2E_BOOKING };
  const stripe = {
    paymentIntents: {
      retrieve: async (id: string) => ({ id, amount: 100000, metadata }),
    },
    transfers: {
      list: async () => ({ data: transfers }),
      createReversal: async (transferId: string, params: { amount: number }, options?: { idempotencyKey?: string }) => {
        const key = options?.idempotencyKey;
        if (key && seenKeys.has(key)) return seenKeys.get(key)!;
        const r = { id: `trr_${reversals.length + 1}` };
        reversals.push({ transferId, amount: params.amount, key });
        if (key) seenKeys.set(key, r);
        return r;
      },
    },
  };
  return { reversals, stripe: stripe as unknown as Stripe };
}

/** No-op transition + notify stubs wired to a recording Supabase, capturing calls. */
function stubDeps(
  db: RecordingDb,
  over: Partial<RefundDeps> = {},
): {
  deps: RefundDeps;
  calls: { markRefunded: string[]; markDisputed: string[]; notifyReversal: string[]; notifyPartial: number[] };
} {
  const calls = { markRefunded: [] as string[], markDisputed: [] as string[], notifyReversal: [] as string[], notifyPartial: [] as number[] };
  const ok = (id: string) => ({ ok: true as const, data: { id } as never });
  const deps: RefundDeps = {
    supabase: db.client,
    markRefunded: async (txnId: string) => {
      calls.markRefunded.push(txnId);
      return ok(txnId);
    },
    markDisputed: async (txnId: string) => {
      calls.markDisputed.push(txnId);
      return ok(txnId);
    },
    notifyBookingPayoutReversal: async (_sb, bookingId) => {
      calls.notifyReversal.push(bookingId);
    },
    notifyClientPartialRefund: async (_sb, _bookingId, cents) => {
      calls.notifyPartial.push(cents);
    },
    ...over,
  };
  return { deps, calls };
}

const parentTxn = (): Row => ({
  id: E2E_TXN,
  booking_id: E2E_BOOKING,
  source_tenant_id: "tn1",
  source_inquiry_id: "inq1",
  payer_user_id: "u1",
  payer_email: "c@example.com",
  payout_receiver_id: null,
  payout_receiver_kind: null,
  payout_receiver_display_name: null,
  currency: "usd",
  provider: "stripe",
  created_by_profile_id: null,
});

// One commission lane: 6000 platform fee + 24000 workspace margin + 70000 talent.
const snap = (over: Partial<Row> = {}): Row => ({
  booking_id: E2E_BOOKING,
  participant_id: "p1",
  platform_fee_cents: 6000,
  workspace_fee_cents: 24000,
  talent_net_cents: 70000,
  currency_code: "usd",
  ...over,
});

const wsLeg = (over: Partial<Row> = {}): Row => ({
  id: "L_ws",
  booking_id: E2E_BOOKING,
  participant_id: "p1",
  party: "workspace",
  amount_cents: 24000,
  currency: "usd",
  status: "transferred",
  stripe_transfer_id: "tr_ws",
  attempts: 1,
  ...over,
});

const talentLeg = (over: Partial<Row> = {}): Row => ({
  id: "L_t",
  booking_id: E2E_BOOKING,
  participant_id: "p1",
  party: "talent",
  amount_cents: 70000,
  currency: "usd",
  status: "transferred",
  stripe_transfer_id: "tr_t",
  attempts: 1,
  ...over,
});

test("e2e full refund: markRefunded + every leg reversed + booking flipped refunded + notified", async () => {
  const db = makeDb({ booking_payouts: [talentLeg(), wsLeg()], agency_bookings: [{ id: E2E_BOOKING }] });
  const { deps, calls } = stubDeps(db);
  const { reversals, stripe } = makeStripe({
    transfers: [
      { id: "tr_t", amount: 70000, amount_reversed: 0 },
      { id: "tr_ws", amount: 24000, amount_reversed: 0 },
    ],
  });

  const handled = await handleBookingRefund(
    stripe,
    { paymentIntentId: E2E_PI, chargeId: E2E_CHARGE, refundedCents: 100000, refundId: "re_full", refundAmountCents: 100000 },
    deps,
  );

  assert.equal(handled, true, "recognised as a booking refund");
  assert.deepEqual(calls.markRefunded, [E2E_TXN], "transaction marked refunded once");
  assert.equal(reversals.length, 2, "both legs reversed at Stripe");
  assert.deepEqual(reversals.map((r) => r.amount).sort((a, b) => a - b), [24000, 70000]);
  assert.ok(reversals.every((r) => r.key?.startsWith("reverse_tr")), "full-reversal key scheme");
  assert.ok(db.tables.booking_payouts.every((l) => l.status === "reversed"), "both legs marked reversed");
  const bookingPatch = db.updates.find((u) => u.table === "agency_bookings")?.patch;
  assert.equal(bookingPatch?.payment_status, "refunded");
  assert.equal(bookingPatch?.client_revenue_lifecycle, "refunded");
  assert.deepEqual(calls.notifyReversal, [E2E_BOOKING], "reversal notified once");
});

test("e2e partial refund: records the per-refund slice + reverses the workspace leg with a unique key", async () => {
  const db = makeDb({
    booking_transactions: [parentTxn()],
    booking_commission_snapshot: [snap()],
    booking_payouts: [talentLeg(), wsLeg()],
    agency_bookings: [{ id: E2E_BOOKING }],
  });
  const { deps, calls } = stubDeps(db);
  const { reversals, stripe } = makeStripe();

  // Refund 20000: 6000 absorbed by the platform fee, 14000 clawed from the
  // workspace margin; talent (70000) untouched.
  const handled = await handleBookingRefund(
    stripe,
    { paymentIntentId: E2E_PI, chargeId: E2E_CHARGE, refundedCents: 20000, refundId: "re_a", refundAmountCents: 20000 },
    deps,
  );

  assert.equal(handled, true);
  assert.equal(calls.markRefunded.length, 0, "partial does NOT mark the parent refunded");

  const refundRow = db.inserts.find((i) => i.table === "booking_transactions");
  assert.ok(refundRow, "partial refund row inserted");
  assert.equal(refundRow!.row.provider_refund_id, "re_a");
  assert.equal(refundRow!.row.gross_amount_cents, 20000);
  assert.equal(refundRow!.row.refund_of_transaction_id, E2E_TXN);

  assert.equal(reversals.length, 1, "only the workspace leg reversed");
  assert.equal(reversals[0].transferId, "tr_ws");
  assert.equal(reversals[0].amount, 14000, "20000 − 6000 platform fee");
  assert.equal(reversals[0].key, "reverse_partial_tr_ws_re_a", "unique-per-refund partial key");
  assert.equal(db.tables.booking_payouts.find((l) => l.id === "L_t")!.status, "transferred", "talent leg untouched");
  assert.deepEqual(calls.notifyPartial, [20000], "client notified of the partial");
});

test("e2e re-delivered partial (same refund id): no 2nd clawing row AND no 2nd reversal", async () => {
  const db = makeDb({
    booking_transactions: [parentTxn()],
    booking_commission_snapshot: [snap()],
    booking_payouts: [talentLeg(), wsLeg()],
    agency_bookings: [{ id: E2E_BOOKING }],
  });
  const { deps, calls } = stubDeps(db);
  const { reversals, stripe } = makeStripe();

  const input = { paymentIntentId: E2E_PI, chargeId: E2E_CHARGE, refundedCents: 20000, refundId: "re_a", refundAmountCents: 20000 };
  await handleBookingRefund(stripe, input, deps);
  await handleBookingRefund(stripe, input, deps); // same event re-delivered

  const refundRows = db.inserts.filter((i) => i.table === "booking_transactions" && i.row.provider_refund_id === "re_a");
  assert.equal(refundRows.length, 1, "only ONE clawing row for the re-delivered refund");
  assert.equal(reversals.length, 1, "only ONE reversal — the re-delivery is an event-level no-op");
  assert.equal(calls.notifyPartial.length, 1, "client notified exactly once");
});

test("e2e two DISTINCT partials on one transfer → two reversals with DISTINCT keys (Task 1)", async () => {
  const db = makeDb({
    booking_transactions: [parentTxn()],
    booking_commission_snapshot: [snap()],
    booking_payouts: [talentLeg(), wsLeg()],
    agency_bookings: [{ id: E2E_BOOKING }],
  });
  const { deps } = stubDeps(db);
  const { reversals, stripe } = makeStripe();

  // First partial: 20000 (6000 platform + 14000 workspace claw).
  await handleBookingRefund(
    stripe,
    { paymentIntentId: E2E_PI, chargeId: E2E_CHARGE, refundedCents: 20000, refundId: "re_a", refundAmountCents: 20000 },
    deps,
  );
  // Second, genuinely-different partial slice 8000 (6000 platform + 2000 claw).
  // The point under test is the KEY: a different refund id must yield a different
  // idempotency key so Stripe applies it instead of rejecting a reuse — exactly
  // the bug the old `reverse_partial_<transferId>` key caused.
  await handleBookingRefund(
    stripe,
    { paymentIntentId: E2E_PI, chargeId: E2E_CHARGE, refundedCents: 28000, refundId: "re_b", refundAmountCents: 8000 },
    deps,
  );

  assert.equal(reversals.length, 2, "two distinct partial reversals applied (not rejected on key reuse)");
  assert.equal(reversals[0].key, "reverse_partial_tr_ws_re_a");
  assert.equal(reversals[1].key, "reverse_partial_tr_ws_re_b");
  assert.notEqual(reversals[0].key, reversals[1].key, "distinct refunds → distinct keys");
  assert.equal(new Set(reversals.map((r) => r.key)).size, 2, "both keys unique");
});

test("e2e dispute.lost: markRefunded + payouts reversed + booking flipped + notified", async () => {
  const db = makeDb({ booking_payouts: [talentLeg(), wsLeg()], agency_bookings: [{ id: E2E_BOOKING }] });
  const { deps, calls } = stubDeps(db);
  const { reversals, stripe } = makeStripe({
    transfers: [
      { id: "tr_t", amount: 70000, amount_reversed: 0 },
      { id: "tr_ws", amount: 24000, amount_reversed: 0 },
    ],
  });

  const handled = await handleBookingDispute(
    stripe,
    { paymentIntentId: E2E_PI, disputeId: "dp_1", amount: 100000, reason: "fraudulent", status: "lost", closed: true },
    deps,
  );

  assert.equal(handled, true);
  assert.deepEqual(calls.markRefunded, [E2E_TXN], "lost dispute mirrors the full refund");
  assert.equal(reversals.length, 2, "both legs reversed");
  assert.ok(db.tables.booking_payouts.every((l) => l.status === "reversed"));
  assert.deepEqual(calls.notifyReversal, [E2E_BOOKING]);
});

test("e2e dispute.won: transaction restored to paid (guarded on 'disputed'), no reversal", async () => {
  const db = makeDb({
    booking_transactions: [{ id: E2E_TXN, status: "disputed" }],
    booking_payouts: [talentLeg(), wsLeg()],
  });
  const { deps, calls } = stubDeps(db);
  const { reversals, stripe } = makeStripe();

  const handled = await handleBookingDispute(
    stripe,
    { paymentIntentId: E2E_PI, disputeId: "dp_2", amount: 100000, reason: "fraudulent", status: "won", closed: true },
    deps,
  );

  assert.equal(handled, true);
  assert.equal(calls.markRefunded.length, 0, "won dispute does not refund");
  assert.equal(reversals.length, 0, "no payout reversal on a won dispute");
  assert.equal(db.tables.booking_transactions.find((r) => r.id === E2E_TXN)!.status, "paid", "transaction restored to paid");
});

test("e2e dispute.created: marks disputed + does NOT reverse the money", async () => {
  const db = makeDb({ booking_payouts: [talentLeg(), wsLeg()] });
  const { deps, calls } = stubDeps(db);
  const { reversals, stripe } = makeStripe();

  const handled = await handleBookingDispute(
    stripe,
    { paymentIntentId: E2E_PI, disputeId: "dp_3", amount: 100000, reason: "fraudulent", status: "needs_response", closed: false },
    deps,
  );

  assert.equal(handled, true);
  assert.deepEqual(calls.markDisputed, [E2E_TXN], "transaction flagged disputed");
  assert.equal(calls.markRefunded.length, 0);
  assert.equal(reversals.length, 0, "transfers NOT reversed while the dispute is open");
  assert.ok(db.tables.booking_payouts.every((l) => l.status === "transferred"), "legs left intact");
});

test("e2e non-booking charge → handler returns false (caller falls through)", async () => {
  const db = makeDb({});
  const { deps } = stubDeps(db);
  // PI with no transaction_id metadata → not a booking charge.
  const { stripe } = makeStripe({ metadata: {} });

  const handled = await handleBookingRefund(
    stripe,
    { paymentIntentId: "pi_topup", chargeId: "ch_x", refundedCents: 5000, refundId: "re_x", refundAmountCents: 5000 },
    deps,
  );
  assert.equal(handled, false, "not a booking refund → caller handles the balance-top-up path");
});
