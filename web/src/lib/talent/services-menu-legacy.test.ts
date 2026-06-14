import { test } from "node:test";
import assert from "node:assert/strict";
import {
  legacyToServiceMenuItems,
  hasImportableLegacy,
  parsePackageTeasers,
} from "./services-menu-legacy";
import { validateServicesMenu, normalizeServicesMenu } from "./services-menu-types";

test("parsePackageTeasers: keeps named teasers, drops junk, trims", () => {
  const out = parsePackageTeasers([
    { label: "  Wedding  ", detail: " full day " },
    { label: "" },
    { detail: "no label" },
    "junk",
    null,
    { label: "DJ", detail: null },
  ]);
  assert.deepEqual(out, [
    { label: "Wedding", detail: "full day" },
    { label: "DJ", detail: null },
  ]);
});

test("hasImportableLegacy: true on a fixed rate or any teaser, else false", () => {
  assert.equal(hasImportableLegacy({ packageTeasers: [], fixedRateCents: null, currency: "USD" }), false);
  assert.equal(hasImportableLegacy({ packageTeasers: [], fixedRateCents: 0, currency: "USD" }), false);
  assert.equal(hasImportableLegacy({ packageTeasers: [], fixedRateCents: 50000, currency: "USD" }), true);
  assert.equal(
    hasImportableLegacy({ packageTeasers: [{ label: "X", detail: null }], fixedRateCents: null, currency: "USD" }),
    true,
  );
});

test("legacyToServiceMenuItems: fixed rate → priced flat_package, teasers → custom; valid + normalizable", () => {
  const items = legacyToServiceMenuItems({
    packageTeasers: [
      { label: "Full wedding", detail: "Ceremony to reception" },
      { label: "Half day", detail: null },
    ],
    fixedRateCents: 150000,
    currency: "EUR",
  });
  assert.equal(items.length, 3);
  // fixed rate first
  assert.equal(items[0].name, "Standard booking");
  assert.equal(items[0].pricingType, "flat_package");
  assert.equal(items[0].amountCents, 150000);
  assert.equal(items[0].currency, "EUR");
  // teasers are quote-on-request
  assert.equal(items[1].name, "Full wedding");
  assert.equal(items[1].pricingType, "custom");
  assert.equal(items[1].amountCents, null);
  assert.equal(items[1].description, "Ceremony to reception");
  // ids unique
  assert.equal(new Set(items.map((i) => i.id)).size, 3);
  // passes validation + survives normalize (the real save path)
  assert.deepEqual(validateServicesMenu(items), []);
  assert.equal(normalizeServicesMenu(items).length, 3);
});

test("legacyToServiceMenuItems: nothing to import → []", () => {
  assert.deepEqual(legacyToServiceMenuItems({ packageTeasers: [], fixedRateCents: null, currency: "USD" }), []);
});
