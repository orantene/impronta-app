import test from "node:test";
import assert from "node:assert/strict";

import {
  apportionDiscount,
  eligibleLines,
  eligibleSubtotalCents,
} from "./promo-eligibility";

const VIP = { id: "l1", totalCents: 10000, eventId: "e1", variantId: "vip" };
const GA1 = { id: "l2", totalCents: 2500, eventId: "e1", variantId: "ga" };
const GA2 = { id: "l3", totalCents: 2500, eventId: "e1", variantId: "ga" };
const OTHER = { id: "l4", totalCents: 4000, eventId: "e2", variantId: "ga" };
const ORDER = [VIP, GA1, GA2, OTHER];

test("a tier-scoped code covers ONLY that tier — the bug this module exists for", () => {
  // Passing the whole-order subtotal to applyPromo would have discounted the
  // GA tickets too, because its scope check only asks whether the tier is
  // PRESENT. 10000, not 19000.
  assert.equal(eligibleSubtotalCents(ORDER, { variantId: "vip" }), 10000);
  assert.equal(eligibleLines(ORDER, { variantId: "vip" }).map((l) => l.id).join(), "l1");
});

test("an event-scoped code covers that event's lines, not the whole order", () => {
  assert.equal(eligibleSubtotalCents(ORDER, { eventId: "e1" }), 15000);
});

test("an unscoped code covers everything", () => {
  assert.equal(eligibleSubtotalCents(ORDER, {}), 19000);
});

test("the narrowest scope wins when both are set", () => {
  assert.equal(eligibleSubtotalCents(ORDER, { eventId: "e1", variantId: "ga" }), 5000);
});

test("shares sum to EXACTLY the discount — no cent invented or lost", () => {
  // Three equal lines splitting 100 cents is the classic: independent rounding
  // gives 33+33+33 = 99, and the missing cent surfaces as a refund that does
  // not reconcile with the charge.
  const three = [
    { id: "a", totalCents: 1000 },
    { id: "b", totalCents: 1000 },
    { id: "c", totalCents: 1000 },
  ];
  const shares = apportionDiscount(three, {}, 100);
  assert.equal(shares.reduce((s, x) => s + x.shareCents, 0), 100);
  assert.deepEqual(shares.map((s) => s.shareCents).sort(), [33, 33, 34]);
});

test("an ineligible line gets ZERO, so refunding it returns what it was charged", () => {
  const shares = apportionDiscount(ORDER, { variantId: "vip" }, 5000);
  const byId = new Map(shares.map((s) => [s.id, s.shareCents]));
  assert.equal(byId.get("l1"), 5000, "the VIP line carries the whole discount");
  for (const id of ["l2", "l3", "l4"]) {
    assert.equal(byId.get(id), 0, `${id} was never discounted`);
  }
});

test("apportionment is proportional, not equal", () => {
  const shares = apportionDiscount([VIP, GA1], {}, 1000);
  const byId = new Map(shares.map((s) => [s.id, s.shareCents]));
  // 10000 : 2500 = 4:1 → 800 / 200, never 500/500.
  assert.equal(byId.get("l1"), 800);
  assert.equal(byId.get("l2"), 200);
});

test("the same order apportions the same way every time it is asked", () => {
  // Ties broken by id, not by sort stability or chance. Two refunds of the same
  // line must agree, and a nondeterministic tie-break makes them disagree by a
  // cent in a way nobody can reproduce.
  const tied = [
    { id: "b", totalCents: 1000 },
    { id: "a", totalCents: 1000 },
    { id: "c", totalCents: 1000 },
  ];
  const first = JSON.stringify(apportionDiscount(tied, {}, 100));
  for (let i = 0; i < 20; i++) {
    assert.equal(JSON.stringify(apportionDiscount(tied, {}, 100)), first);
  }
});

test("a discount larger than the eligible subtotal is clamped, not over-apportioned", () => {
  const shares = apportionDiscount([GA1], {}, 99999);
  assert.equal(shares[0]?.shareCents, 2500, "never refund more than the line was charged");
});

test("zero and negative discounts apportion to nothing", () => {
  for (const d of [0, -1]) {
    const shares = apportionDiscount(ORDER, {}, d);
    assert.equal(shares.reduce((s, x) => s + x.shareCents, 0), 0);
    assert.equal(shares.length, ORDER.length, "every line still gets a row");
  }
});

test("a tier code does NOT reach the same tier at a different event", () => {
  // The bug the compose-fix closed. Filtering on the tier alone let a
  // "VIP at Friday's show" code discount VIP at every other show — and the DB
  // guarantees a tier code always carries an event, so this is reachable, not
  // hypothetical.
  const fri = { id: "f", totalCents: 9000, eventId: "fri", variantId: "vip" };
  const sat = { id: "s", totalCents: 9000, eventId: "sat", variantId: "vip" };
  assert.equal(
    eligibleSubtotalCents([fri, sat], { eventId: "fri", variantId: "vip" }),
    9000,
    "Saturday's VIP must not be discounted by Friday's code",
  );
});
