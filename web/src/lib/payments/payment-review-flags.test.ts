/**
 * TUL-1283 / TUL-1284 / TUL-1268 M2: a charge Stripe took that the settle path
 * cannot book cleanly leaves a durable flag on its money row, instead of a log
 * line nobody reads.
 *
 * The flag reuses the existing attention stamp on `booking_transactions.metadata`
 * (`needs_attention`, the same field paid-after-cancel and refund_failed use),
 * plus a `payment_flags` list so a second, different problem on the same row is
 * never lost behind the first one.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  applyPaymentReviewFlag,
  openPaymentReviewFlags,
  type PaymentReviewFlagInput,
} from "./payment-review-flags-model";
import { flagPaymentForReview, type FlagPaymentDeps } from "./payment-review-flags";
import type { SupabaseClient } from "@supabase/supabase-js";
import { moneyStore } from "@/lib/talent-agenda/__fixtures__/money-store";

const NOW = "2026-10-19T12:00:00.000Z";

const MISMATCH: PaymentReviewFlagInput = {
  reason: "amount_mismatch",
  paymentIntentId: "pi_a",
  otherPaymentIntentId: null,
  expectedAmountCents: 101500,
  expectedCurrency: "MXN",
  chargedAmountCents: 90000,
  chargedCurrency: "mxn",
  rowStatus: "payment_requested",
  stripeEventId: "evt_1",
};

describe("applyPaymentReviewFlag (pure)", () => {
  test("adds one flag and stamps needs_attention when the row has none", () => {
    const r = applyPaymentReviewFlag({ payment_link: "l1" }, MISMATCH, NOW);
    assert.equal(r.created, true);
    assert.equal(r.metadata.payment_link, "l1", "existing metadata is kept");
    assert.equal(r.metadata.needs_attention, "amount_mismatch");
    assert.equal(r.metadata.needs_attention_at, NOW);
    const flags = openPaymentReviewFlags(r.metadata);
    assert.equal(flags.length, 1);
    assert.deepEqual(flags[0], {
      reason: "amount_mismatch",
      paymentIntentId: "pi_a",
      otherPaymentIntentId: null,
      expectedAmountCents: 101500,
      expectedCurrency: "MXN",
      chargedAmountCents: 90000,
      chargedCurrency: "mxn",
      rowStatus: "payment_requested",
      stripeEventId: "evt_1",
      flaggedAt: NOW,
    });
  });

  test("the same reason + PaymentIntent twice is one flag (replays are no-ops)", () => {
    const once = applyPaymentReviewFlag(null, MISMATCH, NOW);
    const twice = applyPaymentReviewFlag(once.metadata, { ...MISMATCH, stripeEventId: "evt_2" }, NOW);
    assert.equal(twice.created, false);
    assert.equal(openPaymentReviewFlags(twice.metadata).length, 1);
  });

  test("a different problem on the same row is kept, and the first stamp is not overwritten", () => {
    const first = applyPaymentReviewFlag({ needs_attention: "paid_after_cancellation" }, MISMATCH, NOW);
    assert.equal(first.metadata.needs_attention, "paid_after_cancellation");
    const dup = applyPaymentReviewFlag(
      first.metadata,
      { ...MISMATCH, reason: "duplicate_charge", paymentIntentId: "pi_b", otherPaymentIntentId: "pi_a" },
      NOW,
    );
    assert.equal(dup.created, true);
    assert.deepEqual(
      openPaymentReviewFlags(dup.metadata).map((f) => f.reason),
      ["amount_mismatch", "duplicate_charge"],
    );
  });

  test("garbage in metadata.payment_flags never throws and is ignored", () => {
    assert.deepEqual(openPaymentReviewFlags({ payment_flags: "nope" }), []);
    assert.deepEqual(openPaymentReviewFlags({ payment_flags: [null, 3, { reason: "unknown" }] }), []);
    assert.deepEqual(openPaymentReviewFlags(null), []);
  });

  test("a resolved flag is not open", () => {
    const r = applyPaymentReviewFlag(null, MISMATCH, NOW);
    const flags = (r.metadata.payment_flags as Array<Record<string, unknown>>).map((f) => ({ ...f, resolved_at: NOW }));
    assert.deepEqual(openPaymentReviewFlags({ ...r.metadata, payment_flags: flags }), []);
  });
});

type Notified = Parameters<FlagPaymentDeps["notify"]>[0];

function store(meta: Record<string, unknown> | null = { payment_link: "l1" }) {
  const s = moneyStore({
    booking_transactions: [
      {
        id: "x1",
        status: "payment_requested",
        gross_amount_cents: 101500,
        currency: "MXN",
        source_tenant_id: "t1",
        booking_id: "b1",
        source_inquiry_id: null,
        metadata: meta,
      },
    ],
  });
  // The fixture implements the slice of the client the writer calls.
  return { ...s, admin: s.admin as unknown as Pick<SupabaseClient, "from"> };
}

describe("flagPaymentForReview (writer)", () => {
  test("writes exactly one flag, leaves the amount untouched, and rings the workspace Money bell", async () => {
    const s = store();
    const notified: Notified[] = [];
    const r = await flagPaymentForReview(s.admin, { transactionId: "x1", flag: MISMATCH, nowIso: NOW }, {
      notify: (p) => notified.push(p),
    });
    assert.deepEqual(r, { ok: true, created: true });
    const row = s.tables.booking_transactions[0]!;
    assert.equal(row.gross_amount_cents, 101500, "no amount changes");
    assert.equal(row.status, "payment_requested", "no status changes");
    assert.equal(openPaymentReviewFlags(row.metadata).length, 1);
    assert.equal(s.writes.length, 1);
    assert.deepEqual(Object.keys(s.writes[0]!.patch), ["metadata"], "only metadata is written");
    assert.equal(notified.length, 1);
    assert.equal(notified[0]!.tenantId, "t1");
    assert.equal(notified[0]!.reason, "amount_mismatch");
  });

  test("a replay writes nothing and does not ring again", async () => {
    const s = store();
    const notified: Notified[] = [];
    const deps = { notify: (p: Notified) => notified.push(p) };
    await flagPaymentForReview(s.admin, { transactionId: "x1", flag: MISMATCH, nowIso: NOW }, deps);
    const r = await flagPaymentForReview(s.admin, { transactionId: "x1", flag: MISMATCH, nowIso: NOW }, deps);
    assert.deepEqual(r, { ok: true, created: false });
    assert.equal(s.writes.length, 1);
    assert.equal(notified.length, 1);
  });

  test("a missing row is an error, not a silent success", async () => {
    const s = store();
    const r = await flagPaymentForReview(s.admin, { transactionId: "nope", flag: MISMATCH, nowIso: NOW }, {
      notify: () => undefined,
    });
    assert.equal(r.ok, false);
  });
});
