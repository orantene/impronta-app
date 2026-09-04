import assert from "node:assert/strict";
import test from "node:test";

import { applyPromo, discountFor, type PromoCode, type PromoContext } from "./promo";

const NOW = "2026-09-10T12:00:00.000Z";

function code(over: Partial<PromoCode> = {}): PromoCode {
  return {
    id: "p1",
    code: "SALSA10",
    kind: "percent",
    value: 10,
    isActive: true,
    perCustomerLimit: 1,
    ...over,
  };
}

function ctx(over: Partial<PromoContext> = {}): PromoContext {
  return {
    now: NOW,
    subtotalCents: 3000,
    counts: { total: 0, forThisCustomer: 0 },
    ...over,
  };
}

test("a percentage is integer cents, floored, and decided rather than inherited", () => {
  assert.equal(discountFor(code(), 3000), 300);
  // $30.05 at 10% is 300.5 cents. Floored to 300: the discount never exceeds
  // the percentage advertised, and rounding up hands out a cent nobody agreed to.
  assert.equal(discountFor(code(), 3005), 300);
  assert.equal(discountFor(code({ value: 100 }), 3000), 3000);
  assert.equal(discountFor(code({ kind: "fixed", value: 500, currency: "USD" }), 3000), 500);

  const applied = applyPromo(code(), ctx());
  assert.deepEqual(applied, { ok: true, discountCents: 300, clamped: false });
});

test("a fixed discount larger than the order is CLAMPED, not written as-is", () => {
  // `orders` carries CHECK (total_cents = subtotal - discount + tax) and
  // CHECK (total_cents >= 0). A $5 code on a $3 ticket would write discount 500
  // against subtotal 300, violate the constraint, and show the buyer a checkout
  // error instead of a free ticket.
  const r = applyPromo(code({ kind: "fixed", value: 500, currency: "USD" }), ctx({ subtotalCents: 300 }));
  assert.ok(r.ok);
  assert.equal(r.discountCents, 300);
  assert.equal(r.clamped, true, "caller needs to know it covered the whole order");
});

test("expired and not-yet-started are different sentences, and neither is 'invalid'", () => {
  const early = applyPromo(code({ startsAt: "2026-09-15T00:00:00.000Z" }), ctx());
  assert.equal(early.ok, false);
  assert.equal(early.reason, "not_started");

  const late = applyPromo(code({ endsAt: "2026-09-01T00:00:00.000Z" }), ctx());
  assert.equal(late.ok, false);
  assert.equal(late.reason, "expired");

  // "Invalid code" for an early-bird that ended on Sunday is untrue and
  // unhelpful: they typed it correctly.
  assert.notEqual(late.reason, "inactive");

  assert.deepEqual(applyPromo(code({ isActive: false }), ctx()), { ok: false, reason: "inactive" });
});

test("limits are counted from rows the caller passes, never from a stored counter", () => {
  const comp = code({ code: "GUESTLIST", kind: "percent", value: 100, maxRedemptions: 20 });

  assert.ok(applyPromo(comp, ctx({ counts: { total: 19, forThisCustomer: 0 } })).ok);
  // The 21st guest is refused. product_discounts keeps an unlocked int here and
  // two simultaneous checkouts both read 19 and both write 20.
  assert.deepEqual(applyPromo(comp, ctx({ counts: { total: 20, forThisCustomer: 0 } })),
    { ok: false, reason: "exhausted" });

  const perCustomer = applyPromo(code({ perCustomerLimit: 2 }),
    ctx({ counts: { total: 5, forThisCustomer: 2 } }));
  assert.equal(perCustomer.ok, false);
  assert.equal(perCustomer.reason, "customer_limit_reached");
});

test("scope narrows: workspace, then event, then tier", () => {
  // No scope: applies anywhere.
  assert.ok(applyPromo(code(), ctx({ eventId: "ev-1" })).ok);

  // Event-scoped, wrong event.
  assert.deepEqual(applyPromo(code({ eventId: "ev-1" }), ctx({ eventId: "ev-2" })),
    { ok: false, reason: "wrong_event" });
  assert.ok(applyPromo(code({ eventId: "ev-1" }), ctx({ eventId: "ev-1" })).ok);

  // Tier-scoped: the tier must actually be on the order. A DJ's code for her own
  // tier must not discount somebody's VIP table.
  const tierCode = code({ eventId: "ev-1", variantId: "var-ga" });
  assert.deepEqual(applyPromo(tierCode, ctx({ eventId: "ev-1", variantIds: ["var-vip"] })),
    { ok: false, reason: "wrong_tier" });
  assert.ok(applyPromo(tierCode, ctx({ eventId: "ev-1", variantIds: ["var-vip", "var-ga"] })).ok);
});

test("a free order refuses rather than burning a redemption on nothing", () => {
  // Returning a 0 discount would let a 20-comp code spend one of its twenty on
  // an order it did not change.
  assert.deepEqual(applyPromo(code(), ctx({ subtotalCents: 0 })),
    { ok: false, reason: "nothing_to_discount" });
});

test("nonsense refuses instead of computing a wrong number", () => {
  assert.equal(applyPromo(code({ value: 0 }), ctx()).reason, "bad_input");
  assert.equal(applyPromo(code({ value: 150 }), ctx()).reason, "bad_input");
  assert.equal(applyPromo(code(), ctx({ subtotalCents: -100 })).reason, "bad_input");
  assert.equal(applyPromo(code(), ctx({ subtotalCents: 30.5 })).reason, "bad_input");
  assert.equal(applyPromo(code(), ctx({ now: "not a date" })).reason, "bad_input");
});
