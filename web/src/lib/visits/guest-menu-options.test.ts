import assert from "node:assert/strict";
import test from "node:test";

import {
  GUEST_OPTION_COPY,
  guestOptionCopy,
  guestPriceLabel,
  guestVariantSellable,
  lineUnitCents,
  needsOption,
  type GuestMenuOptionItem,
} from "./guest-menu-options";

const sized: GuestMenuOptionItem = {
  id: "i1",
  title: "Michelada",
  amountCents: null,
  options: [
    { id: "o-s", label: "Chico", amountCents: 6000 },
    { id: "o-l", label: "Grande", amountCents: 9000 },
  ],
};
const plain: GuestMenuOptionItem = { id: "i2", title: "Agua", amountCents: 3000, options: [] };
const baseWithOptions: GuestMenuOptionItem = {
  id: "i3",
  title: "Cafe",
  amountCents: 4000,
  options: [{ id: "o-x", label: "Doble", amountCents: 5500 }, { id: "o-n", label: "Sin cobro extra", amountCents: null }],
};

test("an item priced only by its options needs an option; a base-priced one does not", () => {
  assert.equal(needsOption(sized), true);
  assert.equal(needsOption(plain), false);
  assert.equal(needsOption(baseWithOptions), false);
});

test("the price on the line is the chosen option's, else the base; never a made-up zero", () => {
  assert.equal(lineUnitCents(sized, "o-l"), 9000);
  assert.equal(lineUnitCents(plain, null), 3000);
  assert.equal(lineUnitCents(baseWithOptions, "o-x"), 5500);
  // an option with no own price falls back to the base, like the server
  assert.equal(lineUnitCents(baseWithOptions, "o-n"), 4000);
  assert.equal(lineUnitCents(baseWithOptions, null), 4000);
  // no option on an option-only item, or an option that is not this item's: refused (null)
  assert.equal(lineUnitCents(sized, null), null);
  assert.equal(lineUnitCents(sized, "nope"), null);
});

test("price label: 'from' the cheapest option when only options price the item", () => {
  assert.deepEqual(guestPriceLabel(sized), { kind: "from", cents: 6000 });
  assert.deepEqual(guestPriceLabel(plain), { kind: "fixed", cents: 3000 });
  assert.deepEqual(guestPriceLabel({ ...sized, options: [] }), { kind: "none" });
});

test("copy: ES and EN, same keys, no em dashes", () => {
  assert.deepEqual(Object.keys(GUEST_OPTION_COPY.en).sort(), Object.keys(GUEST_OPTION_COPY.es).sort());
  assert.equal(guestOptionCopy("es").choose, "Elige una opción");
  assert.equal(guestOptionCopy("en").choose, "Choose an option");
  assert.equal(guestOptionCopy("es-MX").from, "Desde");
  for (const l of ["en", "es"] as const) for (const v of Object.values(GUEST_OPTION_COPY[l])) assert.ok(!v.includes("—"));
});

test("guest variant gate: this dish only, not hidden, inside the sales window", () => {
  const now = new Date("2026-10-19T12:00:00Z");
  const ok = { offering_id: "d", is_hidden: false };
  assert.equal(guestVariantSellable(ok, "d", now), true);
  assert.equal(guestVariantSellable({ ...ok, is_hidden: true }, "d", now), false);
  assert.equal(guestVariantSellable(ok, "other", now), false);
  assert.equal(guestVariantSellable(null, "d", now), false);
  assert.equal(guestVariantSellable({ ...ok, sales_from: "2026-10-20T00:00:00Z" }, "d", now), false);
  assert.equal(guestVariantSellable({ ...ok, sales_until: "2026-10-19T12:00:00Z" }, "d", now), false);
  assert.equal(guestVariantSellable({ ...ok, sales_until: "garbage" }, "d", now), false);
});
