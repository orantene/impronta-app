/**
 * E5 (TUL-1268 M9): a full refund (or lost dispute) of ONE charge on a booking
 * whose other charges are still paid reverses only that charge's share of each
 * payout leg, lowers the ledger amount to what is still paid out, and leaves
 * the booking and its order live. Driven end-to-end through the RefundDeps seam
 * with the shared fakes in `__fixtures__/refunds-fakes.ts`.
 *
 * Run: npm run test:wt -- src/lib/payments/refunds-charge-share.test.ts
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { shareOfLegCents } from "./charge-share-math";
import { handleBookingDispute, handleBookingRefund } from "./refunds";
import {
  E2E_BOOKING,
  E2E_PI,
  E2E_TXN,
  makeDb,
  makeStripe,
  stubDeps,
  talentLeg,
  wsLeg,
  type RecordingDb,
} from "./__fixtures__/refunds-fakes";

//
// The payout legs are per booking (one transfer per participant + party, paid on
// the balance), so they were funded by BOTH charges. Before the fix a full refund
// of the 30000 deposit reversed every leg in full (70000 + 24000 = 94000), taking
// back the balance's share too while the 70000 balance stayed paid.

const DEPOSIT_TXN = E2E_TXN;
const BALANCE_TXN = "txn_balance";

function depositBalanceDb(): RecordingDb {
  return makeDb({
    booking_payouts: [talentLeg(), wsLeg()],
    agency_bookings: [{ id: E2E_BOOKING, order_id: "ord_dep", tenant_id: "ten_dep" }],
    orders: [{ id: "ord_dep", tenant_id: "ten_dep", status: "paid" }],
    booking_transactions: [
      { id: DEPOSIT_TXN, booking_id: E2E_BOOKING, status: "paid", gross_amount_cents: 30000, checkout_type: "deposit", refund_of_transaction_id: null, order_id: "ord_dep", source_tenant_id: "ten_dep" },
      { id: BALANCE_TXN, booking_id: E2E_BOOKING, status: "paid", gross_amount_cents: 70000, checkout_type: "balance", refund_of_transaction_id: null, order_id: "ord_dep", source_tenant_id: "ten_dep" },
    ],
  });
}

/** The booking + order were flipped to refunded (the lifecycle patch and the order stamp). */
function bookingMarkedRefunded(db: RecordingDb): { booking: boolean; order: boolean } {
  return {
    booking: db.updates.some((u) => u.table === "agency_bookings" && u.patch.payment_status === "refunded"),
    order: db.tables.orders?.[0]?.status === "refunded",
  };
}

const liveTransfers = () => [
  { id: "tr_t", amount: 70000, amount_reversed: 0 },
  { id: "tr_ws", amount: 24000, amount_reversed: 0 },
];

const depositRefund = {
  paymentIntentId: E2E_PI,
  chargeId: "ch_deposit",
  refundedCents: 30000,
  refundId: "re_dep",
  refundAmountCents: 30000,
};

test("E5: full refund of the deposit reverses only the deposit's share of each leg (30%)", async () => {
  const db = depositBalanceDb();
  const { deps, calls } = stubDeps(db);
  const { reversals, stripe } = makeStripe({ amount: 30000, transfers: liveTransfers() });

  const handled = await handleBookingRefund(stripe, depositRefund, deps);

  assert.equal(handled, true);
  assert.deepEqual(calls.markRefunded, [DEPOSIT_TXN]);
  assert.deepEqual(
    reversals.map((r) => [r.transferId, r.amount]).sort(),
    [["tr_t", 21000], ["tr_ws", 7200]],
    "30000 / 100000 of each leg: talent 21000 (not 70000), workspace 7200 (not 24000)",
  );
  assert.ok(db.tables.booking_payouts.every((l) => l.status === "transferred"), "legs stay live for the balance's share");
  assert.deepEqual(
    db.tables.booking_payouts.map((l) => [l.party, l.amount_cents]).sort(),
    [["talent", 49000], ["workspace", 16800]],
    "the ledger amount is what is still paid out (transferred minus reversed)",
  );
  assert.deepEqual(calls.notifyReversal, [E2E_BOOKING], "the talent is told about the reversed share");
  // Review fix (1): the balance is still paid, so the booking and its order are NOT refunded.
  assert.deepEqual(bookingMarkedRefunded(db), { booking: false, order: false });
});

test("E5: a re-delivered deposit refund does not reverse the share a second time", async () => {
  const db = depositBalanceDb();
  const { deps } = stubDeps(db);
  const { reversals, stripe } = makeStripe({ amount: 30000, transfers: liveTransfers() });

  await handleBookingRefund(stripe, depositRefund, deps);
  await handleBookingRefund(stripe, depositRefund, deps);

  assert.equal(reversals.length, 2, "one reversal per leg, not two");
});

test("E5: the balance refunded after the deposit takes the whole remainder", async () => {
  // Deposit already refunded (its 30% share reversed): the balance is now the
  // only live charge, so its full refund reverses what is left of each leg.
  const db = depositBalanceDb();
  db.tables.booking_transactions[0]!.status = "refunded";
  // The ledger after the deposit's share reversal: amounts already lowered.
  db.tables.booking_payouts[0]!.amount_cents = 49000;
  db.tables.booking_payouts[1]!.amount_cents = 16800;
  const { deps } = stubDeps(db);
  const { reversals, stripe } = makeStripe({
    amount: 70000,
    metadata: { transaction_id: BALANCE_TXN, booking_id: E2E_BOOKING },
    transfers: [
      { id: "tr_t", amount: 70000, amount_reversed: 21000 },
      { id: "tr_ws", amount: 24000, amount_reversed: 7200 },
    ],
  });

  await handleBookingRefund(
    stripe,
    { paymentIntentId: E2E_PI, chargeId: "ch_balance", refundedCents: 70000, refundId: "re_bal", refundAmountCents: 70000 },
    deps,
  );

  assert.deepEqual(reversals.map((r) => [r.transferId, r.amount]).sort(), [["tr_t", 49000], ["tr_ws", 16800]]);
  assert.ok(db.tables.booking_payouts.every((l) => l.status === "reversed"));
  // The last live charge refunded: the booking and the order ARE refunded.
  assert.deepEqual(bookingMarkedRefunded(db), { booking: true, order: true });
});

test("E5: a ledger written before this fix (full amount, partly reversed) still reverses only the remainder", async () => {
  const db = depositBalanceDb();
  db.tables.booking_transactions[0]!.status = "refunded";
  const { deps } = stubDeps(db);
  const { reversals, stripe } = makeStripe({
    amount: 70000,
    metadata: { transaction_id: BALANCE_TXN, booking_id: E2E_BOOKING },
    transfers: [
      { id: "tr_t", amount: 70000, amount_reversed: 21000 },
      { id: "tr_ws", amount: 24000, amount_reversed: 7200 },
    ],
  });

  await handleBookingRefund(
    stripe,
    { paymentIntentId: E2E_PI, chargeId: "ch_balance", refundedCents: 70000, refundId: "re_bal", refundAmountCents: 70000 },
    deps,
  );

  assert.deepEqual(reversals.map((r) => [r.transferId, r.amount]).sort(), [["tr_t", 49000], ["tr_ws", 16800]]);
});

test("E5: a held leg (never sent) is reduced by the refunded charge's share, once", async () => {
  const db = depositBalanceDb();
  db.tables.booking_payouts[0]!.status = "held";
  db.tables.booking_payouts[0]!.stripe_transfer_id = null;
  const { deps } = stubDeps(db);
  const { reversals, stripe } = makeStripe({ amount: 30000, transfers: [{ id: "tr_ws", amount: 24000, amount_reversed: 0 }] });

  await handleBookingRefund(stripe, depositRefund, deps);
  await handleBookingRefund(stripe, depositRefund, deps);

  const talent = db.tables.booking_payouts.find((l) => l.party === "talent")!;
  assert.equal(talent.status, "held", "still owed the balance's share");
  assert.equal(talent.amount_cents, 49000, "70000 - 21000, reduced once even on a re-delivery");
  assert.deepEqual(reversals.map((r) => [r.transferId, r.amount]), [["tr_ws", 7200]]);
});

test("E5: a lost dispute on the deposit claws back only the deposit's share", async () => {
  const db = depositBalanceDb();
  const { deps } = stubDeps(db);
  const { reversals, stripe } = makeStripe({ amount: 30000, transfers: liveTransfers() });

  await handleBookingDispute(
    stripe,
    { paymentIntentId: E2E_PI, disputeId: "dp_dep", amount: 30000, reason: "fraudulent", status: "lost", closed: true },
    deps,
  );

  assert.deepEqual(reversals.map((r) => [r.transferId, r.amount]).sort(), [["tr_t", 21000], ["tr_ws", 7200]]);
  assert.deepEqual(bookingMarkedRefunded(db), { booking: false, order: false }, "the balance is still paid");
});

test("shareOfLegCents rounds a half-cent share half-up, and the remainder keeps the other cent", () => {
  // leg 33333 split across two equal charges 20833 / 20833: exact share is
  // 33333 * 20833 / 41666 = 16666.5. Math.round gives 16667; floor would give
  // 16666, so this pins the rounding mode.
  const leg = 33333;
  const refunded = shareOfLegCents(leg, 20833, 20833);
  assert.equal(refunded, 16667, "x.5 rounds up (floor would give 16666)");
  assert.equal(leg - refunded, 16666, "what stays paid out is leg minus the share");

  // Mirrored: the other charge is the refunded one; its share is also exactly x.5.
  const mirrored = shareOfLegCents(leg, 20833, 20833);
  assert.equal(mirrored, 16667);
  assert.equal(leg - mirrored, 16666);

  // Small x.5 (leg 5, charges 1/1 -> 2.5): share 3, remainder 2.
  const odd = shareOfLegCents(5, 1, 1);
  assert.equal(odd, 3);
  assert.equal(odd + (5 - odd), 5, "no cent lost or created: share + remainder = leg");
  assert.equal(refunded + (leg - refunded), leg, "share + remainder = leg");
});
