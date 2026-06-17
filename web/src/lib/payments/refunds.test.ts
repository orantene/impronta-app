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
 * (The handler entry points resolve their own service-role client and are not
 * injectable; the dedup contract lives in this function.)
 *
 * Run: npx tsx --test src/lib/payments/refunds.test.ts
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { recordPartialRefund } from "./refunds";

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
