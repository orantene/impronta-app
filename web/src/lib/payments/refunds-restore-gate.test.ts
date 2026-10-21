/**
 * E5 x E3: the inventory restore (tickets, seats, promo; TUL-1268 M5) runs only
 * when the refunded charge leaves nothing live on the booking. A deposit fully
 * refunded while the balance is still paid (`shareOnly`), or a refund whose
 * payouts need manual review, must NOT give the order's tickets and seats back.
 *
 * Run: npm run test:wt -- src/lib/payments/refunds-restore-gate.test.ts
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

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

function bookingDb(balanceStatus: "paid" | "none"): RecordingDb {
  const charges = [
    { id: E2E_TXN, booking_id: E2E_BOOKING, status: "paid", gross_amount_cents: 30000, refund_of_transaction_id: null },
  ];
  if (balanceStatus === "paid") {
    charges.push({ id: "txn_balance", booking_id: E2E_BOOKING, status: "paid", gross_amount_cents: 70000, refund_of_transaction_id: null });
  }
  return makeDb({ booking_payouts: [talentLeg(), wsLeg()], agency_bookings: [{ id: E2E_BOOKING }], booking_transactions: charges });
}

function restoreSpy(): { restored: string[]; restoreInventory: (sb: unknown, transactionId: string) => Promise<void> } {
  const restored: string[] = [];
  return {
    restored,
    restoreInventory: async (_sb: unknown, transactionId: string) => {
      restored.push(transactionId);
    },
  };
}

const transfers = () => [
  { id: "tr_t", amount: 70000, amount_reversed: 0 },
  { id: "tr_ws", amount: 24000, amount_reversed: 0 },
];

test("a deposit fully refunded while the balance is still paid does NOT restore inventory", async () => {
  const db = bookingDb("paid");
  const spy = restoreSpy();
  const { deps } = stubDeps(db, { restoreInventory: spy.restoreInventory });
  const { stripe } = makeStripe({ amount: 30000, transfers: transfers() });

  await handleBookingRefund(
    stripe,
    { paymentIntentId: E2E_PI, chargeId: "ch_dep", refundedCents: 30000, refundId: "re_dep", refundAmountCents: 30000 },
    deps,
  );

  assert.deepEqual(spy.restored, [], "before: tickets, seats and promo were given back with the balance still paid");
});

test("a lost dispute on the deposit while the balance is paid does NOT restore inventory", async () => {
  const db = bookingDb("paid");
  const spy = restoreSpy();
  const { deps } = stubDeps(db, { restoreInventory: spy.restoreInventory });
  const { stripe } = makeStripe({ amount: 30000, transfers: transfers() });

  await handleBookingDispute(
    stripe,
    { paymentIntentId: E2E_PI, disputeId: "dp_dep", amount: 30000, reason: "fraudulent", status: "lost", closed: true },
    deps,
  );

  assert.deepEqual(spy.restored, []);
});

test("deposit then balance: no restore on the deposit, exactly one on the balance (last live charge)", async () => {
  const db = bookingDb("paid");
  const spy = restoreSpy();
  // markRefunded flips the charge like the real one, so the balance refund sees the deposit as refunded.
  const { deps } = stubDeps(db, {
    restoreInventory: spy.restoreInventory,
    markRefunded: async (id: string) => {
      const row = db.tables.booking_transactions?.find((t) => t.id === id);
      if (row) row.status = "refunded";
      return { ok: true as const, data: { id } as never };
    },
  });
  const dep = makeStripe({ amount: 30000, transfers: transfers() });
  await handleBookingRefund(
    dep.stripe,
    { paymentIntentId: E2E_PI, chargeId: "ch_dep", refundedCents: 30000, refundId: "re_dep", refundAmountCents: 30000 },
    deps,
  );
  assert.deepEqual(spy.restored, []);

  const bal = makeStripe({ amount: 70000, metadata: { transaction_id: "txn_balance", booking_id: E2E_BOOKING }, transfers: transfers() });
  await handleBookingRefund(
    bal.stripe,
    { paymentIntentId: "pi_bal", chargeId: "ch_bal", refundedCents: 70000, refundId: "re_bal", refundAmountCents: 70000 },
    deps,
  );
  assert.deepEqual(spy.restored, ["txn_balance"], "the last live charge restores");
});

test("the sole charge fully refunded restores inventory exactly once", async () => {
  const db = bookingDb("none");
  const spy = restoreSpy();
  const { deps } = stubDeps(db, { restoreInventory: spy.restoreInventory });
  const { stripe } = makeStripe({ amount: 30000, transfers: transfers() });

  await handleBookingRefund(
    stripe,
    { paymentIntentId: E2E_PI, chargeId: "ch_only", refundedCents: 30000, refundId: "re_only", refundAmountCents: 30000 },
    deps,
  );

  assert.deepEqual(spy.restored, [E2E_TXN]);
});
