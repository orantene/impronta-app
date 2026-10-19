import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDatedPurchase,
  datedCartTotals,
  resolveSalesCloseAt,
  salesState,
  validateDatedCart,
  type DatedLeg,
  type DatedTier,
} from "./dated-purchase";

const tier = (over: Partial<DatedTier> = {}): DatedTier => ({
  id: "v-adult",
  label: "Adult",
  poolKey: "adult",
  amountCents: 5000,
  minPerOrder: 1,
  maxPerOrder: null,
  isHidden: false,
  ...over,
});

const session = {
  id: "s1",
  startsAt: "2026-11-10T15:00:00Z",
  endsAt: "2026-11-10T17:00:00Z",
};

test("sales close: a per-date override wins over the series offset, which wins over the start", () => {
  assert.equal(
    resolveSalesCloseAt({ startsAt: session.startsAt, salesCloseAt: "2026-11-10T12:00:00Z", salesCloseMinutes: 30 }),
    "2026-11-10T12:00:00.000Z",
  );
  assert.equal(
    resolveSalesCloseAt({ startsAt: session.startsAt, salesCloseAt: null, salesCloseMinutes: 60 }),
    "2026-11-10T14:00:00.000Z",
  );
  assert.equal(
    resolveSalesCloseAt({ startsAt: session.startsAt, salesCloseAt: null, salesCloseMinutes: null }),
    "2026-11-10T15:00:00.000Z",
  );
});

test("sales close: a malformed start fails closed (no instant), never open", () => {
  assert.equal(resolveSalesCloseAt({ startsAt: "nope", salesCloseAt: null, salesCloseMinutes: null }), null);
  assert.deepEqual(
    salesState({ startsAt: "nope", salesCloseAt: null, salesCloseMinutes: null, now: new Date("2026-11-01T00:00:00Z") }),
    { open: false, reason: "bad_window" },
  );
});

test("sales state: open before the close, closed at and after it", () => {
  const args = { startsAt: session.startsAt, salesCloseAt: null, salesCloseMinutes: 60 };
  assert.deepEqual(salesState({ ...args, now: new Date("2026-11-10T13:59:59Z") }), { open: true });
  assert.deepEqual(salesState({ ...args, now: new Date("2026-11-10T14:00:00Z") }), { open: false, reason: "closed" });
});

test("cart: refuses an empty cart, a repeated tier, and a leg below the tier minimum", () => {
  const t = tier({ minPerOrder: 2 });
  assert.deepEqual(validateDatedCart([], { seatsLeft: 10 }), { ok: false, reason: "empty" });
  assert.deepEqual(
    validateDatedCart([{ tier: tier(), units: 1 }, { tier: tier(), units: 1 }], { seatsLeft: 10 }),
    { ok: false, reason: "duplicate_tier" },
  );
  assert.deepEqual(validateDatedCart([{ tier: t, units: 1 }], { seatsLeft: 10 }), {
    ok: false,
    reason: "quantity",
    detail: "below_min",
  });
});

test("cart: group size is checked against seats left; refuses, never clamps", () => {
  const legs: DatedLeg[] = [
    { tier: tier(), units: 3 },
    { tier: tier({ id: "v-child", poolKey: "child", label: "Child", amountCents: 2000 }), units: 2 },
  ];
  assert.deepEqual(validateDatedCart(legs, { seatsLeft: 4 }), { ok: false, reason: "not_enough_seats", seatsLeft: 4 });
  assert.deepEqual(validateDatedCart(legs, { seatsLeft: 5 }), { ok: true, totalSeats: 5 });
  // Unknown seats (no pool read) is not "plenty": the pool at reserve time decides.
  assert.deepEqual(validateDatedCart(legs, { seatsLeft: null }), { ok: true, totalSeats: 5 });
});

test("cart: admits_per_unit multiplies the seats a leg takes", () => {
  const table = tier({ id: "v-table", poolKey: "table", admitsPerUnit: 4 });
  assert.deepEqual(validateDatedCart([{ tier: table, units: 2 }], { seatsLeft: 7 }), {
    ok: false,
    reason: "not_enough_seats",
    seatsLeft: 7,
  });
});

test("totals: one price module, subtotal per leg and overall, display only", () => {
  const legs: DatedLeg[] = [
    { tier: tier(), units: 2 },
    { tier: tier({ id: "v-child", poolKey: "child", amountCents: 2500 }), units: 1 },
  ];
  assert.deepEqual(datedCartTotals(legs), { lines: [10000, 2500], subtotalCents: 12500 });
});

test("purchase: one order line and one capacity leg per tier, each per-unit and windowed", () => {
  const legs: DatedLeg[] = [
    { tier: tier(), units: 2 },
    { tier: tier({ id: "v-child", poolKey: "child" }), units: 1 },
  ];
  const input = buildDatedPurchase({
    tenantId: "t",
    clientOrderKey: "key-1234567",
    offeringId: "o",
    session,
    legs,
    poolIdForKey: new Map([["adult", "p-adult"], ["child", "p-child"]]),
    email: "a@b.c",
  });
  assert.ok(input);
  assert.equal(input.sourceChannel, "session_picker");
  assert.equal(input.paymentChoice, "full");
  assert.deepEqual(input.lines, [
    { offeringId: "o", variantId: "v-adult", sessionId: "s1", units: 2 },
    { offeringId: "o", variantId: "v-child", sessionId: "s1", units: 1 },
  ]);
  assert.equal(input.capacity?.length, 2);
  for (const c of input.capacity ?? []) {
    assert.equal(c.perUnitDomainRow, true);
    assert.equal(c.startsAt, session.startsAt);
    assert.equal(c.endsAt, session.endsAt);
  }
  assert.equal(input.capacity?.[0].poolId, "p-adult");
});

test("purchase: a tier with no pool on this date refuses the whole cart (null), never a partial", () => {
  const out = buildDatedPurchase({
    tenantId: "t",
    clientOrderKey: "key-1234567",
    offeringId: "o",
    session,
    legs: [{ tier: tier(), units: 1 }, { tier: tier({ id: "v-child", poolKey: "child" }), units: 1 }],
    poolIdForKey: new Map([["adult", "p-adult"]]),
    email: "a@b.c",
  });
  assert.equal(out, null);
});

test("purchase: a default single-price item has a null variant and the default pool", () => {
  const input = buildDatedPurchase({
    tenantId: "t",
    clientOrderKey: "key-1234567",
    offeringId: "o",
    session,
    legs: [{ tier: null, units: 3 }],
    poolIdForKey: new Map([["default", "p-default"]]),
    email: "a@b.c",
  });
  assert.ok(input);
  assert.deepEqual(input.lines, [{ offeringId: "o", variantId: null, sessionId: "s1", units: 3 }]);
  assert.equal(input.capacity?.[0].poolId, "p-default");
});

import { heldColumnRead } from "./dated-purchase";

test("held column read: only a missing column (42703) reads as not set; every other error fails", () => {
  assert.equal(heldColumnRead(null), "value");
  assert.equal(heldColumnRead(undefined), "value");
  assert.equal(heldColumnRead({ code: "42703" }), "missing");
  assert.equal(heldColumnRead({ code: "57014" }), "fail");
  assert.equal(heldColumnRead({ code: null }), "fail");
  assert.equal(heldColumnRead({}), "fail");
});
