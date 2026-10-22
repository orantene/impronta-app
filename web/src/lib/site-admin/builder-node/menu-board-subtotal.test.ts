/** TUL-1894: the menu cart's running total. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { cartSubtotal, type MenuChoice, type MenuChoiceOffering } from "./menu-board-choices";

const none: MenuChoice = { variantId: null, addonIds: [] };
const dish = (id: string, amountCents: number | null, extra: Partial<MenuChoiceOffering> = {}): MenuChoiceOffering => ({ id, amountCents, currency: "MXN", ...extra });

test("sums price x quantity across lines", () => {
  const out = cartSubtotal([
    { offering: dish("a", 9000), quantity: 2, choice: none },
    { offering: dish("b", 5000), quantity: 1, choice: none },
  ]);
  assert.deepEqual(out, { amountCents: 23000, currency: "MXN" });
});

test("the chosen option replaces the dish price and chosen extras add to it", () => {
  const o = dish("a", null, {
    options: [{ id: "s", label: "Small", amountCents: 6000 }, { id: "l", label: "Large", amountCents: 9000 }],
    extras: [{ id: "x", label: "Cheese", amountCents: 1500 }, { id: "y", label: "Free", amountCents: null }],
  });
  assert.deepEqual(cartSubtotal([{ offering: o, quantity: 2, choice: { variantId: "l", addonIds: ["x", "y"] } }]), { amountCents: 21000, currency: "MXN" });
});

test("a quote line adds nothing; no priced line or mixed currencies show no total", () => {
  assert.equal(cartSubtotal([{ offering: dish("q", null), quantity: 1, choice: none }]), null);
  assert.equal(cartSubtotal([]), null);
  assert.equal(
    cartSubtotal([
      { offering: dish("a", 100), quantity: 1, choice: none },
      { offering: dish("b", 100, { currency: "USD" }), quantity: 1, choice: none },
    ]),
    null,
  );
  assert.deepEqual(cartSubtotal([{ offering: dish("a", 100), quantity: 3, choice: none }, { offering: dish("q", null), quantity: 1, choice: none }]), { amountCents: 300, currency: "MXN" });
});

test("the island draws the subtotal line and the copy exists in en and es", () => {
  const src = readFileSync("src/lib/site-admin/builder-node/menu-board-island.tsx", "utf8");
  assert.match(src, /data-menu-subtotal/);
  assert.match(src, /cartSubtotal\(selectedLines\)/);
  for (const l of ["en", "es"]) {
    assert.ok(JSON.parse(readFileSync(`messages/${l}.json`, "utf8")).public.menuBoard.subtotal, l);
  }
});
