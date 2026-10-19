/**
 * TUL-1268 item 3: a deposit payment confirms the booking to the client and
 * tells the talent, while no money step changes (display only).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const src = readFileSync(join(process.cwd(), "src/lib/bookings/transactions.ts"), "utf8");
const body = src.slice(src.indexOf("export async function markPaid("), src.indexOf("export async function initiatePayout("));

test("the booking confirmation is sent on a deposit as well as a full payment", () => {
  const m = body.match(/if \(result\.data\.sourceInquiryId && ([^)]*)\) \{\s*notifyBookingConfirmed\(/);
  assert.ok(m, "notifyBookingConfirmed gate found");
  assert.doesNotMatch(m![1]!, /isDeposit/, "a deposit must not skip the confirmation");
  assert.match(m![1]!, /!paidAfterCancel/, "still never confirms a payment that landed after a cancel");
});

test("the one confirmation event reaches the client and the booked talent", async () => {
  const { findCatalogEntries } = await import("@/lib/notifications/catalog");
  const ids = findCatalogEntries("booking.confirmed").map((e) => e.id);
  assert.ok(ids.includes("booking.confirmed.client"));
  assert.ok(ids.includes("booking.confirmed.talent"));
  const talent = findCatalogEntries("booking.confirmed").find((e) => e.id === "booking.confirmed.talent")!;
  assert.ok(talent.in_app && talent.email, "talent gets in-app + email");
});

test("the confirmation carries ids only: no amount is passed or changed", () => {
  const call = body.match(/notifyBookingConfirmed\(\{([^}]*)\}\)/);
  assert.ok(call);
  assert.doesNotMatch(call![1]!, /amount|cents|price|fee|commission|refund/i);
});

test("charge, fee, payout and booking-sync steps are untouched", () => {
  assert.match(body, /applyBookingPaymentSync\(sbBooking, \{\s*bookingId: result\.data\.bookingId,\s*isDeposit,/);
  assert.match(body, /depositAmountCents: result\.data\.grossAmountCents/);
  assert.match(body, /grossAmountCents: result\.data\.grossAmountCents,\s*currency: result\.data\.currency,\s*paidAt: result\.data\.paidAt,\s*checkoutType/);
  assert.equal(body.split("await executeBookingTransfers(").length - 1, 1);
  // The payout fan-out still waits for the balance/full charge.
  assert.match(body, /if \(!isDeposit && !paidAfterCancel\) \{\s*\/\/ Heal order-backed/);
  // A non-deposit payment still sends the invoice and the confirmation.
  assert.match(body, /if \(!isDeposit && !paidAfterCancel\) \{\s*notifyInvoiceIssued\(/);
});
