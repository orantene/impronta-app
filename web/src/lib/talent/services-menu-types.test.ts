import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeServicesMenu,
  validateServicesMenu,
  pricingTypeRequiresAmount,
  type ServiceMenuItem,
} from "./services-menu-types";
import { servicePricingTypeToOfferUnit, isServiceOfferPriceable } from "./services-menu-offer";

function item(overrides: Partial<ServiceMenuItem> = {}): ServiceMenuItem {
  return {
    id: "a", name: "DJ set", description: null, pricingType: "hour", amountCents: 15000,
    currency: "USD", taxonomyTermIds: null, addOns: [], tiers: [], isActive: true,
    visibility: "public", sortOrder: 0, isInstantBook: false, childServiceIds: null, ...overrides,
  };
}

test("normalize: drops nameless/garbage, defaults active+public+currency", () => {
  const out = normalizeServicesMenu(
    [{ name: "  ", amountCents: 100 }, { pricingType: "day", amountCents: 50000 }, "junk", null, { name: "Set", amountCents: 9000 }],
    "EUR",
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].name, "Set");
  assert.equal(out[0].isActive, true);
  assert.equal(out[0].visibility, "public");
  assert.equal(out[0].currency, "EUR");
});

test("normalize: custom service carries no amount", () => {
  const out = normalizeServicesMenu([{ name: "Bespoke", pricingType: "custom", amountCents: 999 }]);
  assert.equal(out[0].amountCents, null);
  assert.equal(pricingTypeRequiresAmount("custom"), false);
});

test("normalize: clamps negatives, dedups ids, re-indexes sortOrder", () => {
  const out = normalizeServicesMenu([
    { id: "x", name: "B", amountCents: 200, sortOrder: 5 },
    { id: "x", name: "A", amountCents: -50, sortOrder: 1 },
  ]);
  assert.equal(out.length, 2);
  assert.notEqual(out[0].id, out[1].id); // dedup
  assert.deepEqual(out.map((i) => i.sortOrder), [0, 1]); // re-indexed
  assert.equal(out[0].name, "A"); // sorted by original sortOrder (1 before 5)
  assert.equal(out[0].amountCents, null); // A's negative (-50) clamped to null
  assert.equal(out[1].amountCents, 200); // B's amount preserved
});

test("normalize: at most one instant-book service (first active wins)", () => {
  const out = normalizeServicesMenu([
    { name: "One", amountCents: 1000, isInstantBook: true, isActive: false },
    { name: "Two", amountCents: 2000, isInstantBook: true },
    { name: "Three", amountCents: 3000, isInstantBook: true },
  ]);
  const flagged = out.filter((i) => i.isInstantBook);
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].name, "Two"); // first ACTIVE instant-book
});

test("normalize: taxonomyTermIds null when empty, kept when present", () => {
  assert.equal(normalizeServicesMenu([{ name: "G", amountCents: 1, taxonomyTermIds: [] }])[0].taxonomyTermIds, null);
  assert.deepEqual(
    normalizeServicesMenu([{ name: "S", amountCents: 1, taxonomyTermIds: ["t1", "t2", ""] }])[0].taxonomyTermIds,
    ["t1", "t2"],
  );
});

test("validate: non-custom needs a positive amount", () => {
  assert.deepEqual(validateServicesMenu([item({ amountCents: 5000 })]), []);
  assert.equal(validateServicesMenu([item({ amountCents: null })]).length, 1);
  assert.equal(validateServicesMenu([item({ amountCents: 0 })]).length, 1);
  assert.deepEqual(validateServicesMenu([item({ pricingType: "custom", amountCents: null })]), []);
});

test("validate: instant-book service must be active + fixed-priced", () => {
  assert.equal(validateServicesMenu([item({ isInstantBook: true, isActive: false })]).length >= 1, true);
  assert.equal(validateServicesMenu([item({ isInstantBook: true, pricingType: "custom", amountCents: null })]).length >= 1, true);
  assert.deepEqual(validateServicesMenu([item({ isInstantBook: true, amountCents: 20000 })]), []);
});

test("normalize: add-ons, tiers, and bundle childServiceIds (Phase C richness)", () => {
  const out = normalizeServicesMenu([
    {
      name: "Wedding package", pricingType: "flat_package", amountCents: 250000,
      addOns: [{ label: "Overtime hour", pricingType: "hour", amountCents: 12000 }, { label: "" }],
      tiers: [{ label: "Half day", amountCents: 150000 }, { amountCents: 1 /* no label → dropped */ }],
      childServiceIds: ["svc-dj", "svc-mc", ""],
      visibility: "agency_only",
    },
  ]);
  assert.equal(out[0].addOns.length, 1); // the labelless add-on is dropped
  assert.equal(out[0].addOns[0].amountCents, 12000);
  assert.equal(out[0].tiers.length, 1); // the labelless tier is dropped
  assert.deepEqual(out[0].childServiceIds, ["svc-dj", "svc-mc"]); // blanks filtered
  assert.equal(out[0].visibility, "agency_only");
});

test("normalize: empty childServiceIds → null; invalid visibility → public", () => {
  const out = normalizeServicesMenu([{ name: "X", amountCents: 1, childServiceIds: [], visibility: "nope" }]);
  assert.equal(out[0].childServiceIds, null);
  assert.equal(out[0].visibility, "public");
});

test("offer mapper: pricingType maps 1:1 to a valid offer unit; custom not priceable", () => {
  for (const t of ["hour", "day", "week", "half_day", "event", "per_person", "per_contact", "flat_package", "custom"] as const) {
    assert.equal(servicePricingTypeToOfferUnit(t), t);
  }
  assert.equal(isServiceOfferPriceable({ pricingType: "event", amountCents: 10000 }), true);
  assert.equal(isServiceOfferPriceable({ pricingType: "custom", amountCents: 10000 }), false);
  assert.equal(isServiceOfferPriceable({ pricingType: "event", amountCents: null }), false);
});
