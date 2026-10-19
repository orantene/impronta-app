/**
 * TUL-1268 item 3: the deposit/balance notices are display only. Everything
 * that charges, splits or pays out in markPaid is untouched. (The notices
 * themselves are proven at runtime in notifications/booking-notices-dispatch.test.ts.)
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const src = readFileSync(join(process.cwd(), "src/lib/bookings/transactions.ts"), "utf8");
const body = src.slice(src.indexOf("export async function markPaid("), src.indexOf("export async function initiatePayout("));

test("a deposit sends 'reserved', a balance/full payment sends 'confirmed', never the other way", () => {
  assert.match(body, /if \(isDeposit && !paidAfterCancel\) \{\s*notifyBookingReserved\(/);
  assert.match(body, /sourceInquiryId && !isDeposit && !paidAfterCancel\) \{\s*notifyBookingConfirmed\(/);
});

test("the notices pass the stored deposit amount only, and nothing is recomputed", () => {
  const call = body.match(/notifyBookingReserved\(\{([^}]*)\}\)/);
  assert.ok(call);
  assert.match(call![1]!, /depositCents: result\.data\.grossAmountCents/);
  assert.doesNotMatch(call![1]!, /fee|commission|refund|\*|\/ 100/i);
  const confirmed = body.match(/notifyBookingConfirmed\(\{([^}]*)\}\)/);
  assert.ok(confirmed);
  assert.doesNotMatch(confirmed![1]!, /amount|cents|price|fee|commission|refund/i);
});

test("charge, fee, payout and booking-sync steps are untouched", () => {
  assert.match(body, /applyBookingPaymentSync\(sbBooking, \{\s*bookingId: result\.data\.bookingId,\s*isDeposit,/);
  assert.match(body, /depositAmountCents: result\.data\.grossAmountCents/);
  assert.match(body, /grossAmountCents: result\.data\.grossAmountCents,\s*currency: result\.data\.currency,\s*paidAt: result\.data\.paidAt,\s*checkoutType/);
  assert.equal(body.split("await executeBookingTransfers(").length - 1, 1);
  assert.match(body, /if \(!isDeposit && !paidAfterCancel\) \{\s*\/\/ Heal order-backed/);
  assert.match(body, /if \(!isDeposit && !paidAfterCancel\) \{\s*notifyInvoiceIssued\(/);
});
