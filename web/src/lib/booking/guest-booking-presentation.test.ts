import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveGuestBookingPresentation as derive,
  reserveModeFromCheckoutType,
  type GuestBookingPresentationInput,
} from "./guest-booking-presentation";

const NOW = new Date("2026-09-27T15:00:00Z");
const FUTURE = "2026-09-27T15:30:00Z";
const PAST = "2026-09-27T14:30:00Z";

function input(over: Partial<GuestBookingPresentationInput>): GuestBookingPresentationInput {
  return {
    bookingMode: "instant",
    reserveMode: "deposit",
    payAtVisit: false,
    orderStatus: "pending_payment",
    transactionStatus: "payment_requested",
    holdExpiresAt: FUTURE,
    now: NOW,
    locale: "en",
    ...over,
  };
}

test("pay at visit: confirmed on submit, payment due at visit", () => {
  const v = derive(input({ reserveMode: "free", payAtVisit: true, transactionStatus: null, orderStatus: "paid" }));
  assert.equal(v.bookingState, "confirmed");
  assert.equal(v.paymentState, "due_at_visit");
  assert.equal(v.headline, "Confirmed · pay at your visit");
  assert.equal(derive(input({ reserveMode: "free", payAtVisit: true, locale: "es" })).headline, "Confirmada · pagas en tu cita");
});

test("deposit unpaid: held until HH:MM, pay the deposit to confirm", () => {
  const v = derive(input({}));
  assert.equal(v.bookingState, "held");
  assert.equal(v.paymentState, "awaiting");
  assert.match(v.headline, /^Held until \d{2}:\d{2} · pay the deposit to confirm$/);
  assert.match(derive(input({ locale: "es" })).headline, /^Apartada hasta las \d{2}:\d{2} · paga el anticipo para confirmar$/);
});

test("deposit held with no known expiry still never says confirmed", () => {
  const v = derive(input({ holdExpiresAt: null, orderStatus: null, transactionStatus: null }));
  assert.equal(v.bookingState, "held");
  assert.equal(v.headline, "Held · pay the deposit to confirm");
});

test("deposit settled: confirmed with paid and due amounts", () => {
  const v = derive(input({ transactionStatus: "paid", paidCents: 20000, totalCents: 100000, currency: "USD" }));
  assert.equal(v.bookingState, "confirmed");
  assert.equal(v.paymentState, "deposit_paid");
  assert.match(v.headline, /^Confirmed · .*200.* paid, .*800.* due at the visit$/);
});

test("full: held until settled, then confirmed + paid", () => {
  const held = derive(input({ reserveMode: "full" }));
  assert.equal(held.bookingState, "held");
  assert.match(held.headline, /pay to confirm$/);
  const paid = derive(input({ reserveMode: "full", transactionStatus: "paid", orderStatus: "paid" }));
  assert.equal(paid.bookingState, "confirmed");
  assert.equal(paid.paymentState, "paid");
  assert.equal(paid.headline, "Confirmed · paid");
});

test("request: requested, and payment never implies acceptance", () => {
  const v = derive(input({ bookingMode: "request", transactionStatus: "paid", orderStatus: "paid" }));
  assert.equal(v.bookingState, "requested");
  assert.doesNotMatch(`${v.headline} ${v.detail}`, /^Confirmed/);
  assert.equal(derive(input({ bookingMode: "request", locale: "es" })).headline, "Solicitud enviada");
});

test("returned from Stripe, webhook not settled: processing, never confirmed", () => {
  for (const locale of ["en", "es"]) {
    const v = derive(input({ returnedFromCheckout: true, locale }));
    assert.equal(v.bookingState, "processing");
    assert.doesNotMatch(`${v.headline} ${v.detail}`, /Confirmed|Confirmada/);
  }
  assert.equal(derive(input({ returnedFromCheckout: true })).headline, "We're confirming your payment");
});

test("hold lapsed then payment settled late: NOT auto-confirmed", () => {
  const cancelled = derive(input({ transactionStatus: "paid", orderStatus: "cancelled", holdExpiresAt: null }));
  assert.equal(cancelled.bookingState, "needs_attention");
  assert.equal(cancelled.headline, "Payment received, time no longer held");
  const lapsed = derive(input({ transactionStatus: "paid", orderStatus: "pending_payment", holdExpiresAt: PAST }));
  assert.equal(lapsed.bookingState, "needs_attention");
});

test("hold lapsed and unpaid: expired", () => {
  assert.equal(derive(input({ holdExpiresAt: PAST })).bookingState, "expired");
});

test("failed transaction: cancelled, not charged", () => {
  const v = derive(input({ transactionStatus: "failed", orderStatus: "cancelled" }));
  assert.equal(v.bookingState, "cancelled");
  assert.equal(v.paymentState, "failed");
});

test("no copy promises a refund or uses an em dash", () => {
  const cases: Partial<GuestBookingPresentationInput>[] = [
    {}, { reserveMode: "full" }, { transactionStatus: "paid" }, { transactionStatus: "paid", orderStatus: "cancelled" },
    { transactionStatus: "failed" }, { returnedFromCheckout: true }, { holdExpiresAt: PAST }, { bookingMode: "request" },
    { reserveMode: "free", payAtVisit: true },
  ];
  for (const c of cases) {
    for (const locale of ["en", "es"]) {
      const v = derive(input({ ...c, locale }));
      const text = `${v.headline} ${v.detail ?? ""}`;
      assert.doesNotMatch(text, /refund|reembols/i);
      assert.ok(!text.includes("—"));
    }
  }
});

test("checkout_type maps to policy", () => {
  assert.equal(reserveModeFromCheckoutType("deposit"), "deposit");
  assert.equal(reserveModeFromCheckoutType("balance"), "full");
  assert.equal(reserveModeFromCheckoutType(null), null);
});
