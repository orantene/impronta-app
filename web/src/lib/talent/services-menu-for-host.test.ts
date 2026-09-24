import assert from "node:assert/strict";
import test from "node:test";

import { servicesMenuForPublicHost } from "./services-menu-for-host";
import type { ServiceMenuItem } from "./services-menu-types";

function item(partial: Partial<ServiceMenuItem> & Pick<ServiceMenuItem, "id" | "name">): ServiceMenuItem {
  return {
    description: null,
    pricingType: "fixed",
    amountCents: 25000,
    currency: "USD",
    durationMinutes: null,
    visibility: "public",
    isActive: true,
    isInstantBook: false,
    sortOrder: 0,
    taxonomyTermIds: null,
    addOnIds: null,
    packageIncludes: null,
    tiers: null,
    ...partial,
  };
}

test("agency host keeps priced menu lines (D-MSG-400)", () => {
  const priced = item({ id: "a", name: "Walk", amountCents: 180000, currency: "USD" });
  const out = servicesMenuForPublicHost([priced], "agency");
  assert.equal(out[0].amountCents, 180000);
  assert.equal(out[0].pricingType, "fixed");
});

test("hub host strips amounts instead of labelling MXN as USD (D-MSG-400)", () => {
  const priced = item({ id: "b", name: "Show", amountCents: 500000, currency: "USD" });
  const out = servicesMenuForPublicHost([priced], "platform");
  assert.equal(out[0].amountCents, null);
  assert.equal(out[0].pricingType, "custom");
  assert.equal(out[0].name, "Show");
});

test("talent host also strips — eligibility only resolves on agency", () => {
  const priced = item({ id: "c", name: "Set", amountCents: 100, currency: "MXN" });
  const out = servicesMenuForPublicHost([priced], "talent");
  assert.equal(out[0].amountCents, null);
});
