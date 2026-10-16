import assert from "node:assert/strict";
import { test } from "node:test";

import { mapEngineFail } from "./instant-book-run";
import { bookingPromoRequest, instantPaymentStep, promoRefusal } from "./instant-book-promo";

const LINK = "0b9f4a3e-6a1d-4a43-9f39-1c0f8a2b7d11";

test("bookingPromoRequest: code normalized, cookie validated, instant hold, shown discount kept", () => {
  assert.deepEqual(
    bookingPromoRequest({ promoCode: " luz 10 ", promoShownDiscountCents: 10000, linkCookie: LINK, viaCookie: "ig_story" }),
    { code: "LUZ10", linkPromoIds: [LINK], flow: "instant", via: "ig_story", shownDiscountCents: 10000 },
  );
  assert.deepEqual(
    bookingPromoRequest({ promoCode: "", linkCookie: "not-a-uuid", viaCookie: "<script>", promoShownDiscountCents: 12.5 }),
    { code: null, linkPromoIds: [], flow: "instant", via: null, shownDiscountCents: null },
  );
  assert.equal(bookingPromoRequest({ flow: "request_to_book" }).flow, "request_to_book");
});

test("promoRefusal: gone reasons read 'ran out, nothing charged'; code problems keep their message", () => {
  for (const reason of ["promo_exhausted", "promo_customer_limit", "promo_expired"]) {
    const r = promoRefusal(reason, { locale: "es", code: null });
    assert.equal(r?.reason, "promo_gone");
    assert.match(r?.error ?? "", /No se cobró nada/);
    assert.doesNotMatch(r?.error ?? "", /—/, "no em dashes in user copy");
  }
  assert.deepEqual(promoRefusal("promo_unknown", { locale: "en", code: "LUZ10" }), {
    reason: "promo_refused",
    error: "We could not find the code LUZ10",
  });
  assert.equal(promoRefusal("slot_taken", { locale: "es", code: null }), null, "not a promo's refusal");
});

test("the action surfaces promo_gone as a typed result the sheet can act on", () => {
  const r = mapEngineFail({ ok: false, reason: "promo_gone", error: "Esta oferta se acaba de agotar." });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.promoGone, true);
  assert.equal(!r.ok && r.error, "Esta oferta se acaba de agotar.");
  const other = mapEngineFail({ ok: false, reason: "slot_taken" });
  assert.equal(!other.ok && other.promoGone, undefined);
});

test("instantPaymentStep: Stripe only when money is owed; a free booking skips it", () => {
  assert.equal(instantPaymentStep({ collectCents: 40000, transactionId: "t", bookingId: "b" }), "checkout");
  assert.equal(instantPaymentStep({ collectCents: 0, transactionId: null, bookingId: "b" }), "no_charge");
  assert.equal(instantPaymentStep({ collectCents: 500, transactionId: null, bookingId: "b" }), "no_charge");
});
