/**
 * TUL-429 Money page: a refunded sale owes nothing; "Part paid" needs real part-payment facts.
 * Run: node_modules/.bin/tsx --test src/lib/talent/booking-owed.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { bookingOwedCents, isPartPaidRow } from "./booking-owed";

const base = { basisCents: 100000, depositCents: 0, ledgerPaidCents: 0 };

test("a refunded, void, waived or refund-pending booking owes nothing (the 'Te deben $2,000' bug)", () => {
  for (const ps of ["refunded", "refund_pending", "void", "voided", "waived", "cancelled", "written_off"]) {
    assert.equal(bookingOwedCents({ ...base, paymentStatus: ps }), 0, ps);
  }
});

test("a paid booking owes nothing even when the ledger lags", () => {
  assert.equal(bookingOwedCents({ ...base, paymentStatus: "paid" }), 0);
  assert.equal(bookingOwedCents({ ...base, paymentStatus: "PAID " }), 0);
});

test("unchanged cases: unpaid owes the price, a ledger part payment lowers it, partial falls back to the deposit", () => {
  assert.equal(bookingOwedCents({ ...base, paymentStatus: "unpaid" }), 100000);
  assert.equal(bookingOwedCents({ ...base, paymentStatus: "unpaid", ledgerPaidCents: 30000 }), 70000);
  assert.equal(bookingOwedCents({ ...base, paymentStatus: "partial", depositCents: 30000 }), 70000);
  assert.equal(bookingOwedCents({ ...base, paymentStatus: "partial", ledgerPaidCents: 100000 }), 0);
  assert.equal(bookingOwedCents({ ...base, paymentStatus: null, basisCents: 0 }), null, "no price, nothing to say");
});

test("a fully paid payment awaiting payout is NOT 'Part paid' (status 'pending' alone decides nothing)", () => {
  assert.equal(isPartPaidRow({ paymentStatus: "paid", collectedCents: 100000, grossCents: 100000 }), false);
  assert.equal(isPartPaidRow({ paymentStatus: null, collectedCents: 100000, grossCents: 100000 }), false);
  assert.equal(isPartPaidRow({ paymentStatus: null, collectedCents: null, grossCents: 100000 }), false);
});

test("a real part payment is: partial status, or less collected than the price", () => {
  assert.equal(isPartPaidRow({ paymentStatus: "partial", collectedCents: 30000, grossCents: 100000 }), true);
  assert.equal(isPartPaidRow({ paymentStatus: "partially_paid", grossCents: 100000 }), true);
  assert.equal(isPartPaidRow({ paymentStatus: null, collectedCents: 30000, grossCents: 100000 }), true);
  assert.equal(isPartPaidRow({ paymentStatus: "refunded", collectedCents: 30000, grossCents: 100000 }), false);
});

test("the Money page and the clients loader use the helpers, not the old inline chain", () => {
  const home = readFileSync("src/components/talent/money/MoneyHomePage.tsx", "utf8");
  assert.match(home, /isPartPaidRow\(p\)/);
  assert.doesNotMatch(home, /p\.status === "pending" \? ` · \$\{t\("Part paid"\)\}`/);
  const actions = readFileSync("src/lib/talent/clients-actions.ts", "utf8");
  assert.match(actions, /bookingOwedCents\(/);
  assert.doesNotMatch(actions, /if \(booking\.payment_status === "paid"\) owed = 0;/);
});
