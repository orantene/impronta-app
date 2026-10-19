/**
 * BEHAVIORAL TEST: refunds that arrive through the Stripe webhook put the
 * tickets, seats and promo back (TUL-1268 M5, TUL-941).
 *
 * Every non-desk refund route (Stripe dashboard refund, refundTransactionAction,
 * the talent refund, a lost dispute) books its money through the webhook
 * handlers in `refunds.ts`. Those used to mark the transaction refunded and
 * reverse the payouts but left the order's admissions valid, their seats and
 * the order's other capacity committed, and the promo redemption confirmed.
 *
 * What is pinned here, through the real handlers and the real restore step,
 * against a recording fake whose RPCs mirror the SQL semantics
 * (`refund_admission` and `release_capacity` are idempotent by identity):
 *
 *   1. a FULL refund via charge.refunded refunds each paid ticket, releases
 *      each seat and voids the promo, exactly once;
 *   2. a replayed event changes nothing further;
 *   3. a PARTIAL refund restores nothing (the event names no units); the
 *      refund that completes the charge then restores everything once;
 *   4. a full refund of ONE charge while another charge on the same order is
 *      still paid restores nothing (the order is not refunded);
 *   5. a LOST dispute restores like a full refund; a won one does not;
 *   6. a line-level (desk) refund that names specific lines restores only
 *      those lines' tickets, and frees no whole allocation it does not own;
 *   7. an attended ticket keeps its seat even on a full refund.
 *
 * Run: npx tsx --test src/lib/payments/refunds-restore-inventory.test.ts
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import { handleBookingRefund, handleBookingDispute, type RefundDeps } from "./refunds";
import { restoreRefundedLines } from "@/lib/orders/refund-restore";

const TXN = "txn_m5";
const TXN_OTHER = "txn_m5_balance";
const BOOKING = "bk_m5";
const ORDER = "ord_m5";
const TENANT = "ten_m5";
const PI = "pi_m5";
const CHARGE = "ch_m5";
const CHARGE_CENTS = 100000;

type Row = Record<string, unknown>;
type Filter = { col: string; op: "eq" | "neq" | "in" | "is"; val: unknown };

type Fake = {
  client: SupabaseClient;
  tables: Record<string, Row[]>;
  /** Admission ids actually moved to `refunded` by refund_admission (not the `already` replies). */
  admissionStamps: string[];
  /** Allocation ids actually moved to `released` (rows changed, not calls). */
  allocationReleases: string[];
  /** Promo redemption ids actually moved to `voided`. */
  promoVoids: string[];
};

function makeFake(seed: Record<string, Row[]>): Fake {
  const tables: Record<string, Row[]> = {};
  for (const [t, rows] of Object.entries(seed)) tables[t] = rows.map((r) => ({ ...r }));
  const admissionStamps: string[] = [];
  const allocationReleases: string[] = [];
  const promoVoids: string[] = [];

  const releaseAllocations = (ids: readonly unknown[]): number => {
    let n = 0;
    for (const a of tables.capacity_allocations ?? []) {
      if (ids.includes(a.id) && a.state !== "released") {
        a.state = "released";
        allocationReleases.push(String(a.id));
        n += 1;
      }
    }
    return n;
  };

  const rpc = (fn: string, args: Record<string, unknown>) => {
    if (fn === "refund_admission") {
      const adm = (tables.admissions ?? []).find((a) => a.id === args.p_admission_id);
      if (!adm) return Promise.resolve({ data: { ok: false, reason: "unknown_admission" }, error: null });
      if (adm.status === "refunded") return Promise.resolve({ data: { ok: true, already: true }, error: null });
      if (Number(adm.admitted_count ?? 0) > 0) {
        return Promise.resolve({ data: { ok: false, reason: "already_admitted" }, error: null });
      }
      if (adm.status !== "valid" && adm.status !== "void") {
        return Promise.resolve({ data: { ok: false, reason: "not_valid" }, error: null });
      }
      adm.status = "refunded";
      admissionStamps.push(String(adm.id));
      if (adm.allocation_id) releaseAllocations([adm.allocation_id]);
      return Promise.resolve({ data: { ok: true, already: false }, error: null });
    }
    if (fn === "release_capacity") {
      const ids = (args.p_allocation_ids as unknown[] | undefined) ?? [];
      const released = releaseAllocations(ids);
      return Promise.resolve({ data: { ok: true, released }, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  };

  const make = (table: string) => {
    const filters: Filter[] = [];
    let patch: Row | null = null;
    const matches = (r: Row) =>
      filters.every((f) => {
        const v =
          f.col === "provider_metadata->>payment_intent_id"
            ? ((r.provider_metadata as Row | undefined)?.payment_intent_id ?? null)
            : r[f.col];
        if (f.op === "eq") return v === f.val;
        if (f.op === "neq") return v !== f.val;
        if (f.op === "is") return (v ?? null) === f.val;
        return (f.val as unknown[]).includes(v);
      });
    const rows = () => (tables[table] ?? []).filter(matches);
    const applyPatch = () => {
      const p = patch;
      patch = null;
      if (!p) return false;
      for (const r of rows()) {
        if (table === "tenant_promo_redemptions" && p.status === "voided" && r.status !== "voided") {
          promoVoids.push(String(r.id));
        }
        Object.assign(r, p);
      }
      return true;
    };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string, val: unknown) => (filters.push({ col, op: "eq", val }), chain),
      neq: (col: string, val: unknown) => (filters.push({ col, op: "neq", val }), chain),
      in: (col: string, val: unknown[]) => (filters.push({ col, op: "in", val }), chain),
      is: (col: string, val: unknown) => (filters.push({ col, op: "is", val }), chain),
      // Filters this fake does not model narrow nothing (none of the asserted reads use them).
      not: () => chain,
      or: () => chain,
      filter: () => chain,
      gt: () => chain,
      gte: () => chain,
      lt: () => chain,
      lte: () => chain,
      limit: () => chain,
      order: () => chain,
      update: (p: Row) => ((patch = p), chain),
      insert: (row: Row) => {
        const stored = { id: `ins_${(tables[table] ?? []).length + 1}`, ...row };
        (tables[table] ??= []).push(stored);
        const ret: Record<string, unknown> = {
          select: () => ret,
          single: () => Promise.resolve({ data: stored, error: null }),
          maybeSingle: () => Promise.resolve({ data: stored, error: null }),
          then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
        };
        return ret;
      },
      maybeSingle: () => {
        applyPatch();
        return Promise.resolve({ data: rows()[0] ?? null, error: null });
      },
      single: () => {
        applyPatch();
        const r = rows()[0] ?? null;
        return Promise.resolve(r ? { data: r, error: null } : { data: null, error: { message: "not found" } });
      },
      then: (resolve: (v: unknown) => void) => {
        if (applyPatch()) return resolve({ data: null, error: null });
        return resolve({ data: rows(), error: null });
      },
    };
    return chain;
  };

  return {
    client: { from: (t: string) => make(t), rpc } as unknown as SupabaseClient,
    tables,
    admissionStamps,
    allocationReleases,
    promoVoids,
  };
}

/** One order: a paid ticket line (2 tickets, 2 seats), a paid session-seat line
 *  (1 allocation, no admission), a $0 comp ticket, and a confirmed promo. */
function seed(extraTxns: Row[] = []): Record<string, Row[]> {
  return {
    booking_transactions: [
      { id: TXN, booking_id: BOOKING, order_id: ORDER, source_tenant_id: TENANT, status: "paid", refund_of_transaction_id: null, gross_amount_cents: CHARGE_CENTS },
      ...extraTxns,
    ],
    agency_bookings: [{ id: BOOKING, order_id: ORDER, tenant_id: TENANT }],
    orders: [{ id: ORDER, tenant_id: TENANT, status: "paid" }],
    order_lines: [
      { id: "L_ticket", order_id: ORDER, total_cents: 60000, refunded_cents: 0 },
      { id: "L_seat", order_id: ORDER, total_cents: 40000, refunded_cents: 0 },
      { id: "L_comp", order_id: ORDER, total_cents: 0, refunded_cents: 0 },
    ],
    admissions: [
      { id: "A1", order_line_id: "L_ticket", line_seq: 1, admitted_count: 0, status: "valid", allocation_id: "AL1" },
      { id: "A2", order_line_id: "L_ticket", line_seq: 2, admitted_count: 0, status: "valid", allocation_id: "AL2" },
      { id: "A_comp", order_line_id: "L_comp", line_seq: 1, admitted_count: 0, status: "valid", allocation_id: "AL_comp" },
    ],
    capacity_allocations: [
      { id: "AL1", order_line_id: "L_ticket", state: "committed" },
      { id: "AL2", order_line_id: "L_ticket", state: "committed" },
      { id: "AL_seat", order_line_id: "L_seat", state: "committed" },
      { id: "AL_comp", order_line_id: "L_comp", state: "committed" },
    ],
    tenant_promo_redemptions: [{ id: "P1", order_id: ORDER, status: "confirmed" }],
    booking_payouts: [],
  };
}

function stripeFake(): Stripe {
  return {
    paymentIntents: {
      retrieve: async (id: string) => ({ id, amount: CHARGE_CENTS, metadata: { transaction_id: TXN, booking_id: BOOKING } }),
    },
    transfers: { list: async () => ({ data: [] }), createReversal: async () => ({ id: "trr" }) },
    refunds: { list: async () => ({ data: [], has_more: false }) },
  } as unknown as Stripe;
}

function deps(fake: Fake): RefundDeps {
  const ok = (id: string) => ({ ok: true as const, data: { id } as never });
  return {
    supabase: fake.client,
    markRefunded: async (id: string) => ok(id),
    markDisputed: async (id: string) => ok(id),
    notifyBookingPayoutReversal: async () => undefined,
    notifyClientPartialRefund: async () => undefined,
  };
}

const sorted = (xs: string[]) => [...xs].sort();

function assertRestoredOnce(fake: Fake) {
  assert.deepEqual(sorted(fake.admissionStamps), ["A1", "A2"], "each paid ticket refunded exactly once");
  assert.deepEqual(sorted(fake.allocationReleases), ["AL1", "AL2", "AL_seat"], "each paid seat released exactly once");
  assert.deepEqual(fake.promoVoids, ["P1"], "promo redemption voided exactly once");
  const comp = fake.tables.admissions.find((a) => a.id === "A_comp");
  assert.equal(comp?.status, "valid", "a $0 comp ticket nobody paid for is not touched");
}

function assertNothingRestored(fake: Fake, why: string) {
  assert.deepEqual(fake.admissionStamps, [], `${why}: no ticket refunded`);
  assert.deepEqual(fake.allocationReleases, [], `${why}: no seat released`);
  assert.deepEqual(fake.promoVoids, [], `${why}: promo kept`);
}

test("full refund via charge.refunded restores tickets, seats and promo exactly once", async () => {
  const fake = makeFake(seed());
  const handled = await handleBookingRefund(
    stripeFake(),
    { paymentIntentId: PI, chargeId: CHARGE, refundedCents: CHARGE_CENTS, refundId: "re_full", refundAmountCents: CHARGE_CENTS },
    deps(fake),
  );
  assert.equal(handled, true);
  assertRestoredOnce(fake);
});

test("a replayed full-refund event does not release or void a second time", async () => {
  const fake = makeFake(seed());
  const input = { paymentIntentId: PI, chargeId: CHARGE, refundedCents: CHARGE_CENTS, refundId: "re_full", refundAmountCents: CHARGE_CENTS };
  await handleBookingRefund(stripeFake(), input, deps(fake));
  await handleBookingRefund(stripeFake(), input, deps(fake));
  assertRestoredOnce(fake);
});

test("a partial refund restores nothing; the refund that completes the charge restores once", async () => {
  const fake = makeFake(seed());
  await handleBookingRefund(
    stripeFake(),
    { paymentIntentId: PI, chargeId: CHARGE, refundedCents: 40000, refundId: "re_part", refundAmountCents: 40000 },
    deps(fake),
  );
  assertNothingRestored(fake, "partial refund (no units named on the event)");

  await handleBookingRefund(
    stripeFake(),
    { paymentIntentId: PI, chargeId: CHARGE, refundedCents: CHARGE_CENTS, refundId: "re_rest", refundAmountCents: 60000 },
    deps(fake),
  );
  assertRestoredOnce(fake);
});

test("a full refund of one charge while another charge on the order is still paid restores nothing", async () => {
  const fake = makeFake(
    seed([{ id: TXN_OTHER, booking_id: BOOKING, order_id: ORDER, status: "paid", refund_of_transaction_id: null, gross_amount_cents: 50000 }]),
  );
  await handleBookingRefund(
    stripeFake(),
    { paymentIntentId: PI, chargeId: CHARGE, refundedCents: CHARGE_CENTS, refundId: "re_full", refundAmountCents: CHARGE_CENTS },
    deps(fake),
  );
  assertNothingRestored(fake, "order still holds a paid charge");
});

test("a lost dispute restores tickets, seats and promo once; a replay changes nothing", async () => {
  const fake = makeFake(seed());
  const input = { paymentIntentId: PI, disputeId: "dp_1", amount: CHARGE_CENTS, reason: "fraudulent", status: "lost", closed: true };
  const handled = await handleBookingDispute(stripeFake(), input, deps(fake));
  assert.equal(handled, true);
  await handleBookingDispute(stripeFake(), input, deps(fake));
  assertRestoredOnce(fake);
});

test("a won dispute restores nothing", async () => {
  const fake = makeFake(seed());
  await handleBookingDispute(
    stripeFake(),
    { paymentIntentId: PI, disputeId: "dp_2", amount: CHARGE_CENTS, reason: "fraudulent", status: "won", closed: true },
    deps(fake),
  );
  assertNothingRestored(fake, "won dispute");
});

test("a line-level refund naming specific lines restores only those units", async () => {
  // The desk names the ticket line only, as a partial (not FULL) refund of the order.
  const fake = makeFake(seed());
  const once = { orderId: ORDER, lineIds: ["L_ticket"], wholeLineIds: [], releasePromo: false, logScope: "test" };
  const r = await restoreRefundedLines(fake.client, once);
  assert.equal(r.admissionsStamped, 2);
  assert.deepEqual(sorted(fake.admissionStamps), ["A1", "A2"], "the named line's tickets only");
  assert.deepEqual(sorted(fake.allocationReleases), ["AL1", "AL2"], "only those tickets' own seats");
  assert.deepEqual(fake.promoVoids, [], "a partial keeps the promo");

  // The same desk refund replayed (or its own webhook landing) changes nothing.
  await restoreRefundedLines(fake.client, once);
  assert.deepEqual(sorted(fake.admissionStamps), ["A1", "A2"]);
  assert.deepEqual(sorted(fake.allocationReleases), ["AL1", "AL2"]);
});

test("an attended ticket keeps its seat even on a full refund", async () => {
  const base = seed();
  base.admissions = base.admissions.map((a) => (a.id === "A1" ? { ...a, admitted_count: 1 } : a));
  const fake = makeFake(base);
  await handleBookingRefund(
    stripeFake(),
    { paymentIntentId: PI, chargeId: CHARGE, refundedCents: CHARGE_CENTS, refundId: "re_full", refundAmountCents: CHARGE_CENTS },
    deps(fake),
  );
  assert.deepEqual(fake.admissionStamps, ["A2"], "the scanned ticket is a dispute, not a refund-by-line");
  assert.ok(!fake.allocationReleases.includes("AL1"), "its seat is not freed through the line either");
});
