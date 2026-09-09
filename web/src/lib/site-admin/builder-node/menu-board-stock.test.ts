/**
 * menu-board-stock.test.ts — the menu board's stock and payment rules.
 *
 * Three regressions live here:
 *
 * 1. `unitsLeft: null` means UNLIMITED, not zero. Collapsing them either caps an
 *    unlimited item at nothing or hides a sold-out badge.
 * 2. Pay-in-person is ALL lines, not ANY. Until guest checkout exists a card
 *    request on a menu order is uncompletable (the pay sheet is account-only and
 *    guest threads render payment cards read-only), so an order that says "pay in
 *    person" and cannot be settled that way is the same broken promise inverted.
 * 3. Stock is keyed on PRESENCE, never on `kind`. instant-book reserves only for
 *    `kind === "product"`, and the live seat-limited class is `kind='package'`.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_QTY,
  REFRESH_MIN_INTERVAL_MS,
  fill,
  isSoldOut,
  maxAddableQty,
  mergeLiveOfferings,
  reconcileQuantities,
  shouldPayInPerson,
} from "./menu-board-stock";

test("null stock is unlimited, not zero", () => {
  assert.equal(maxAddableQty({ unitsLeft: null }), MAX_QTY);
  assert.equal(isSoldOut({ unitsLeft: null }), false);
});

test("zero stock is sold out and adds nothing", () => {
  assert.equal(maxAddableQty({ unitsLeft: 0 }), 0);
  assert.equal(isSoldOut({ unitsLeft: 0 }), true);
});

test("a stock-limited item caps at its remaining units", () => {
  assert.equal(maxAddableQty({ unitsLeft: 12 }), 12);
  assert.equal(isSoldOut({ unitsLeft: 12 }), false);
});

test("stock never exceeds the stepper ceiling, and negatives floor at zero", () => {
  assert.equal(maxAddableQty({ unitsLeft: 5000 }), MAX_QTY);
  assert.equal(maxAddableQty({ unitsLeft: -3 }), 0);
  assert.equal(isSoldOut({ unitsLeft: -3 }), true);
});

test("pay in person requires EVERY line to allow it", () => {
  assert.equal(shouldPayInPerson([{ allowPayInPerson: true }]), true);
  assert.equal(
    shouldPayInPerson([{ allowPayInPerson: true }, { allowPayInPerson: true }]),
    true,
  );
  assert.equal(
    shouldPayInPerson([{ allowPayInPerson: true }, { allowPayInPerson: false }]),
    false,
    "one card-only line makes the whole order card-only",
  );
});

test("an empty order is not pay-in-person", () => {
  assert.equal(
    shouldPayInPerson([]),
    false,
    "an empty selection must not render the pay-in-person promise",
  );
});

test("fill interpolates every occurrence of a token", () => {
  assert.equal(fill("Only {count} left", { count: 3 }), "Only 3 left");
  assert.equal(fill("{item} and {item}", { item: "pizza" }), "pizza and pizza");
  assert.equal(fill("no tokens", { count: 1 }), "no tokens");
});

// ── Cart storage key ────────────────────────────────────────────────────────

test("a tenant-less cart is never persisted", async () => {
  // storageKey("") is the bare prefix, so a tenant-less write is not a no-op:
  // it is one cart bucket shared by every tenant a person visits in that
  // browser session. The read and the write call the SAME predicate, so there
  // is no half to delete — which is how this got in (the read checked, the
  // write did not, and the lone guard read as redundant).
  const { cartStorageEnabled } = await import("./menu-board-island");
  const realWindow = (globalThis as Record<string, unknown>).window;
  (globalThis as Record<string, unknown>).window = {};
  try {
    assert.equal(cartStorageEnabled(""), false, "empty tenant id must not persist");
    assert.equal(cartStorageEnabled("   ".trim()), false, "whitespace is not a tenant");
    assert.equal(cartStorageEnabled("tenant-a"), true);
  } finally {
    if (realWindow === undefined) delete (globalThis as Record<string, unknown>).window;
    else (globalThis as Record<string, unknown>).window = realWindow;
  }
});

test("no cart is persisted server-side, whatever the tenant", async () => {
  const { cartStorageEnabled } = await import("./menu-board-island");
  const realWindow = (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).window;
  try {
    assert.equal(cartStorageEnabled("tenant-a"), false);
  } finally {
    if (realWindow !== undefined) (globalThis as Record<string, unknown>).window = realWindow;
  }
});

// ── Live refresh (defect 8: the board could paint stale prices and stock) ────
//
// `menu_board` is the one commerce block that resolves server-side; the other
// three self-fetch. So the numbers on screen were frozen at render time while
// stock decayed underneath them, and the customer found out at submit — after
// filling in name, email and phone. These rules govern the re-read that closed
// that, and the property they all defend is that a refresh may only make the
// board TRUER, never rearrange it and never invent a control.

const dish = (
  id: string,
  unitsLeft: number | null = null,
  amountCents = 1000,
) => ({
  id,
  title: id,
  description: null,
  amountCents,
  currency: "MXN",
  priceType: "fixed",
  priceDisplay: "fixed",
  kind: "product",
  unitsLeft,
  allowPayInPerson: true,
});

test("a live re-read replaces price and stock in place", () => {
  const merged = mergeLiveOfferings(
    [dish("a", 5, 1000), dish("b", null, 2000)],
    [dish("b", null, 2500), dish("a", 1, 1200)],
  );
  assert.deepEqual(
    merged.map((o) => o.id),
    ["a", "b"],
    "the server's sort_order survives a refresh that returns a different order",
  );
  assert.equal(merged[0].unitsLeft, 1);
  assert.equal(merged[0].amountCents, 1200);
  assert.equal(merged[1].amountCents, 2500);
});

test("an item the refresh no longer returns leaves the board", () => {
  const merged = mergeLiveOfferings([dish("a"), dish("b")], [dish("a")]);
  assert.deepEqual(merged.map((o) => o.id), ["a"]);
});

test("an item published since render is NOT appended", () => {
  // It has no server-rendered <li>, so appending would put a quantity stepper
  // under a dish that appears nowhere on the menu above it.
  const merged = mergeLiveOfferings([dish("a")], [dish("a"), dish("new")]);
  assert.deepEqual(merged.map((o) => o.id), ["a"]);
});

test("a refresh that changes nothing returns the same quantities object", () => {
  // Identity, not equality: the caller bails out of setState on it, and a new
  // object every tab focus is a re-render plus a sessionStorage write for a
  // board that did not move.
  const held = { a: 2 };
  assert.equal(reconcileQuantities(held, [dish("a", 10)]), held);
});

test("a cart is clamped down to what stock now allows", () => {
  assert.deepEqual(reconcileQuantities({ a: 6 }, [dish("a", 2)]), { a: 2 });
});

test("a line that sold out while the page sat open is dropped from the cart", () => {
  assert.deepEqual(reconcileQuantities({ a: 3, b: 1 }, [dish("a", 0), dish("b", null)]), {
    b: 1,
  });
});

test("a cart line for a delisted item does not survive the merge", () => {
  const offerings = mergeLiveOfferings([dish("a"), dish("b")], [dish("a")]);
  assert.deepEqual(reconcileQuantities({ a: 1, b: 4 }, offerings), { a: 1 });
});

test("the refresh floor is long enough to collapse a burst and short enough to be honest", () => {
  // pageshow + visibilitychange + mount all fire within a few ms of one back
  // button press; without a floor that is three identical round trips.
  assert.ok(REFRESH_MIN_INTERVAL_MS >= 5_000, "must actually collapse the burst");
  assert.ok(REFRESH_MIN_INTERVAL_MS <= 60_000, "a minute-old price is a wrong price");
});
