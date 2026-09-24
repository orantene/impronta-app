import assert from "node:assert/strict";
import test from "node:test";

import { servicesMenuForPublicHost } from "./services-menu-for-host";
import type { ServiceMenuItem } from "./services-menu-types";

function item(partial: Partial<ServiceMenuItem> & Pick<ServiceMenuItem, "id" | "name">): ServiceMenuItem {
  return {
    description: null,
    pricingType: "flat_package",
    amountCents: 25000,
    currency: "USD",
    visibility: "public",
    isActive: true,
    isInstantBook: false,
    sortOrder: 0,
    taxonomyTermIds: null,
    addOns: [],
    childServiceIds: null,
    tiers: [],
    ...partial,
  };
}

test("USD on a hub host keeps its amount", () => {
  const priced = item({ id: "a", name: "Walk", amountCents: 180000, currency: "USD" });
  const out = servicesMenuForPublicHost([priced], "platform");
  assert.equal(out[0].amountCents, 180000);
  assert.equal(out[0].currency, "USD");
});

test("MXN on a hub host keeps its amount so the US$ line can print", () => {
  const priced = item({ id: "b", name: "Show", amountCents: 500000, currency: "MXN" });
  const out = servicesMenuForPublicHost([priced], "platform");
  assert.equal(out[0].amountCents, 500000);
  assert.equal(out[0].currency, "MXN");
});

test("missing or unknown currency shows no price and no labelled guess", () => {
  const missing = item({ id: "c", name: "Set", amountCents: 100, currency: "" });
  const unknown = item({ id: "d", name: "Cut", amountCents: 200, currency: "XXX" });
  const out = servicesMenuForPublicHost([missing, unknown], "talent");
  assert.equal(out[0].amountCents, null);
  assert.equal(out[0].pricingType, "custom");
  assert.equal(out[1].amountCents, null);
  assert.equal(out[1].name, "Cut");
});

test("agency host keeps every priced line including an unknown code", () => {
  const priced = item({ id: "e", name: "Agency", amountCents: 99, currency: "XXX" });
  const out = servicesMenuForPublicHost([priced], "agency");
  assert.equal(out[0].amountCents, 99);
});
