/**
 * The counter's pure half — above all the collection key, because a key that
 * varies per call is the difference between charging a customer once and
 * charging them twice.
 *
 * Lane: `npm run test:money`.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  chosenSessionId,
  keypadNext,
  parseCashBox,
  posCollectionKey,
  tenderAfterKey,
  toCategoryTabs,
  toHeldSales,
  toProductTiles,
  toShiftSummary,
  type PosCatalogItem,
} from "./counter-model";

const ORDER = "8b0a2b0e-1c4d-4a1f-9f3a-2b7c9d0e1f22";

test("two taps of Charge for the same amount are ONE collection", () => {
  const first = posCollectionKey({ orderId: ORDER, version: 4, method: "cash", amountCents: 1800 });
  const second = posCollectionKey({ orderId: ORDER, version: 4, method: "cash", amountCents: 1800 });
  assert.equal(first, second);
  // The regression in one line: a key minted per call is never equal to
  // itself, so `pos_reserve_collection` sees a second operation and claims
  // the balance a second time.
  assert.notEqual(first, `pos-till:${ORDER}:${crypto.randomUUID()}`);
});

test("a genuinely different attempt gets a different key", () => {
  const base = { orderId: ORDER, version: 4, method: "cash" as const, amountCents: 1800 };
  // Editing a line bumps `orders.version`: charging after an edit is a new
  // attempt, and replaying the old key would collect against a stale total.
  assert.notEqual(posCollectionKey(base), posCollectionKey({ ...base, version: 5 }));
  // A split tab: $18 now and $18 more later are two claims, not one replay.
  assert.notEqual(posCollectionKey(base), posCollectionKey({ ...base, amountCents: 3600 }));
  // Cash and a payment link against one balance are two allocations.
  assert.notEqual(posCollectionKey(base), posCollectionKey({ ...base, method: "online_card" }));
  // And a different sale is obviously a different key.
  assert.notEqual(
    posCollectionKey(base),
    posCollectionKey({ ...base, orderId: "11111111-2222-4333-8444-555555555555" }),
  );
});

test("the key fits the engine's own floor and ceiling", () => {
  // `startCollection` refuses anything under 8 characters and the zod schema
  // in `pos/actions.ts` caps it at 80. A key outside that range is refused
  // as `invalid` and the sale simply will not collect.
  const key = posCollectionKey({
    orderId: ORDER,
    version: 999_999,
    method: "online_card",
    amountCents: 99_999_999,
  });
  assert.ok(key.length >= 8, `too short: ${key.length}`);
  assert.ok(key.length <= 80, `too long: ${key.length} — ${key}`);
});

test("the keypad fills from the right, in minor units", () => {
  // 1, 2, 5 is $1.25 — not $125.00. A till never makes the cashier find a
  // decimal point.
  let cents = 0;
  for (const key of ["1", "2", "5"]) cents = keypadNext(cents, key);
  assert.equal(cents, 125);
  assert.equal(keypadNext(cents, "back"), 12);
  assert.equal(keypadNext(cents, "clear"), 0);
  // A stray key does nothing rather than something.
  assert.equal(keypadNext(cents, "="), 125);
});

test("the keypad cannot be run past a real amount by a stuck key", () => {
  let cents = 0;
  for (let i = 0; i < 40; i += 1) cents = keypadNext(cents, "9");
  assert.ok(Number.isSafeInteger(cents), "the tendered figure stopped being an exact integer");
  assert.equal(cents, 99_999_999);
});

test("the first key press replaces the pre-filled amount due", () => {
  // The sheet opens with $36.00 already tendered, so exact cash is one tap.
  // Typing $40 must give $40.00, not $360,040.00 — which is what appending to
  // the pre-fill produced, on the screen a customer can see.
  let cents = 3600;
  let touched = false;
  for (const key of ["4", "0", "0", "0"]) {
    cents = tenderAfterKey(cents, touched, key);
    touched = true;
  }
  assert.equal(cents, 4000);
  // And once touched, the keypad behaves normally.
  assert.equal(tenderAfterKey(4000, true, "back"), 400);
  // An untouched Clear still lands on zero rather than on the pre-fill.
  assert.equal(tenderAfterKey(3600, false, "clear"), 0);
});

test("an empty cash box is not a counted zero", () => {
  // `openShift` accepts 0 as a real opening float. So "" must NOT become 0 —
  // an operator who typed nothing has not counted the drawer.
  assert.equal(parseCashBox("", 100), null);
  assert.equal(parseCashBox("   ", 100), null);
  assert.equal(parseCashBox("0", 100), 0);
  assert.equal(parseCashBox("12.50", 100), 1250);
  assert.equal(parseCashBox("12.5", 100), 1250);
  // A zero-decimal currency (JPY, CLP, COP) counts whole units.
  assert.equal(parseCashBox("1250", 1), 1250);
  // Anything that is not a plain money figure is refused, not coerced.
  for (const bad of ["-5", "1.234", "12,50", "1e3", "abc", "NaN", "Infinity"]) {
    assert.equal(parseCashBox(bad, 100), null, `"${bad}" must be refused`);
  }
});

const CATALOG: PosCatalogItem[] = [
  { id: "a", title: "House pizza", amountCents: 1800, kind: "product", sessions: [] },
  { id: "b", title: "Posing course", amountCents: 5000, kind: "service", sessions: [] },
  { id: "c", title: "Garlic bread", amountCents: 600, kind: "product", sessions: [] },
];

test("a class place's session is a required choice on the tile, pre-set to the next one", () => {
  const withSessions: PosCatalogItem[] = [
    {
      id: "class",
      title: "Complimentary class",
      amountCents: 0,
      kind: "service",
      sessions: [
        { id: "s-mon", title: "Morning class", startsAt: "2026-09-14T09:00:00Z" },
        { id: "s-tue", title: "Last place class", startsAt: "2026-09-15T09:00:00Z" },
      ],
    },
  ];
  const [tile] = toProductTiles(withSessions, "USD");
  assert.deepEqual(
    tile!.variants?.map((v) => ({ id: v.id, label: v.label, selected: v.selected })),
    [
      { id: "s-mon", label: "Morning class", selected: true },
      { id: "s-tue", label: "Last place class", selected: false },
    ],
  );
  // Picking Tuesday over Monday does not change the price; the tile carries
  // the money.
  assert.ok(tile!.variants?.every((v) => v.deltaCents === 0));

  const picked = toProductTiles(withSessions, "USD", { class: "s-tue" });
  assert.equal(picked[0]!.variants?.find((v) => v.selected)?.id, "s-tue");

  // A plain product must be sold with NO session, not with an invented one.
  assert.equal(toProductTiles(CATALOG, "USD")[0]!.variants, undefined);
  assert.equal(chosenSessionId(CATALOG[0], {}), null);
  // A class place always has one, so a one-tap sale of the next class works.
  assert.equal(chosenSessionId(withSessions[0], {}), "s-mon");
  assert.equal(chosenSessionId(withSessions[0], { class: "s-tue" }), "s-tue");
  // A stale selection (the session was cancelled) falls back to a real one
  // rather than sending the engine an id it will refuse.
  assert.equal(chosenSessionId(withSessions[0], { class: "s-gone" }), "s-mon");
  assert.equal(chosenSessionId(undefined, {}), null);
});

test("tiles and tabs come from the catalog's own kinds, with no invented grouping", () => {
  const tiles = toProductTiles(CATALOG, "USD");
  assert.deepEqual(
    tiles.map((t) => t.categoryId),
    ["product", "service", "product"],
  );
  assert.ok(tiles.every((t) => t.currency === "USD"));

  const tabs = toCategoryTabs(CATALOG, { product: "Products", service: "Services" });
  // One tab per kind PRESENT, first-seen order, no empty tabs for kinds this
  // workspace does not sell.
  assert.deepEqual(tabs, [
    { id: "product", label: "Products" },
    { id: "service", label: "Services" },
  ]);
  // An unlabelled kind falls back to its own id rather than to an empty tab.
  assert.deepEqual(toCategoryTabs(CATALOG, {})[0], { id: "product", label: "product" });
});

test("the sale on screen is not offered as a sale to resume", () => {
  const open = [
    { id: "o1", totalCents: 1800, createdAt: "2026-09-10T10:00:00Z" },
    { id: "o2", totalCents: 600, createdAt: null },
  ];
  const held = toHeldSales(open, "USD", "o1", (id) => `#${id}`);
  assert.deepEqual(
    held.map((h) => h.orderId),
    ["o2"],
  );
  assert.equal(held[0]!.label, "#o2");
  assert.equal(held[0]!.currency, "USD");
  // A missing timestamp is an empty string, never the string "null".
  assert.equal(held[0]!.heldAt, "");
  // With nothing open on screen, every held sale is offered.
  assert.equal(toHeldSales(open, "USD", null, (id) => id).length, 2);
});

test("no shift is null, not a zeroed shift", () => {
  // A zeroed summary would render a drawer with $0.00 in it, which reads as
  // "counted and empty" rather than "nobody opened one".
  assert.equal(toShiftSummary(null), null);
  assert.deepEqual(
    toShiftSummary({ id: "s1", version: 2, openingCashCents: 5000, openedAt: null }),
    { id: "s1", openingCashCents: 5000, openedAt: "" },
  );
});
