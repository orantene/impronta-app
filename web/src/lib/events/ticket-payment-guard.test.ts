/**
 * TUL-1268 M2: `startTicketCardPayment` opened a new Stripe Checkout session
 * without looking at whether the order or its money row was already paid or
 * cancelled, so a second tab or a back-button replay could take a second card
 * charge for tickets already bought. The guard refuses before Stripe is called.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ticketCardPaymentRefusal } from "./ticket-payment-guard";

test("an open order with an unpaid row may start a card payment", () => {
  for (const order of ["draft", "quoted", "pending_payment"]) {
    for (const txn of ["draft", "payment_requested", "pending"]) {
      assert.equal(ticketCardPaymentRefusal(order, txn), null, `${order}/${txn}`);
    }
  }
});

test("a paid order or a settled row refuses as already_paid", () => {
  for (const order of ["paid", "fulfilled", "partially_refunded", "refunded"]) {
    assert.equal(ticketCardPaymentRefusal(order, "payment_requested"), "already_paid", order);
  }
  for (const txn of ["paid", "payout_pending", "payout_sent", "disputed"]) {
    assert.equal(ticketCardPaymentRefusal("pending_payment", txn), "already_paid", txn);
  }
});

test("a cancelled order or a cancelled/failed/refunded row refuses as not_payable", () => {
  assert.equal(ticketCardPaymentRefusal("cancelled", "payment_requested"), "not_payable");
  for (const txn of ["cancelled", "failed", "refunded"]) {
    assert.equal(ticketCardPaymentRefusal("pending_payment", txn), "not_payable", txn);
  }
});

test("an unknown status fails closed", () => {
  assert.equal(ticketCardPaymentRefusal("weird", "payment_requested"), "not_payable");
  assert.equal(ticketCardPaymentRefusal("pending_payment", "weird"), "not_payable");
  assert.equal(ticketCardPaymentRefusal(null, null), "not_payable");
});

test("startTicketCardPayment asks the guard before it opens a Checkout session", () => {
  const src = readFileSync(join(process.cwd(), "src/app/(public)/_events/ticket-picker-actions.ts"), "utf8");
  const body = src.slice(src.indexOf("export async function startTicketCardPayment("));
  const guard = body.indexOf("ticketCardPaymentRefusal(");
  const checkout = body.indexOf("createCheckoutSessionForTransaction(");
  assert.ok(guard > 0, "startTicketCardPayment does not call ticketCardPaymentRefusal");
  assert.ok(guard < checkout, "the guard must run before the Checkout session is created");
});

test("both refusals have guest copy in en and es", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/site-admin/builder-node/ticket-picker-copy.ts"), "utf8");
  for (const key of ["already_paid", "not_payable"]) {
    assert.equal(src.split(`    ${key}: "`).length - 1, 2, `${key} needs exactly one en and one es line`);
  }
});
