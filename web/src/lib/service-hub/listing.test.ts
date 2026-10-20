import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canListForWorkspace,
  checkListingPrice,
  hubPriceDisplay,
  isListingSellable,
  listingClientPriceCents,
  listingFloorCents,
  listingsBreachedByTalentPrice,
  validateListingInput,
  type ServiceListing,
} from "./listing";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";

function listing(over: Partial<ServiceListing>): ServiceListing {
  return {
    id: "l1",
    tenantId: "w1",
    talentProfileId: "p1",
    offeringId: "o1",
    status: "accepted",
    priceMode: "margin",
    marginBps: 2000,
    priceCents: null,
    currency: "MXN",
    talentLowestCents: null,
    workspaceMinCents: 0,
    showWho: "name",
    clientContact: "workspace",
    bookingType: "request",
    acceptedTermsVersion: 1,
    floorBreachedAt: null,
    ...over,
  };
}

test("client price per mode: talent price, + margin, fixed, from", () => {
  assert.equal(listingClientPriceCents(listing({ priceMode: "talent_price" }), 100000), 100000);
  assert.equal(listingClientPriceCents(listing({ priceMode: "margin", marginBps: 2000 }), 100000), 120000);
  assert.equal(listingClientPriceCents(listing({ priceMode: "fixed", priceCents: 150000 }), 100000), 150000);
  assert.equal(listingClientPriceCents(listing({ priceMode: "from", priceCents: 90000 }), 100000), 90000);
});

test("floor = talent price (or the talent's lowest accepted price) + workspace minimum", () => {
  assert.equal(listingFloorCents({ talentPriceCents: 100000, talentLowestCents: null, workspaceMinCents: 5000 }), 105000);
  assert.equal(listingFloorCents({ talentPriceCents: 100000, talentLowestCents: 80000, workspaceMinCents: 5000 }), 85000);
});

test("a listing price below the floor is refused", () => {
  const below = checkListingPrice(listing({ priceMode: "fixed", priceCents: 100000, workspaceMinCents: 5000 }), 100000);
  assert.deepEqual(below, { ok: false, reason: "below_floor", floorCents: 105000 });
  assert.equal(checkListingPrice(listing({ priceMode: "fixed", priceCents: 105000, workspaceMinCents: 5000 }), 100000).ok, true);
  // margin that does not cover the workspace minimum is below the floor too
  assert.equal(checkListingPrice(listing({ priceMode: "margin", marginBps: 100, workspaceMinCents: 5000 }), 100000).ok, false);
});

test("a quote-only service (no talent price) has no numeric floor to break", () => {
  assert.equal(checkListingPrice(listing({ priceMode: "from", priceCents: 1000 }), null).ok, true);
});

test("talent raises the price: fixed and from listings below the new floor are flagged for the owner", () => {
  const ls = [
    listing({ id: "a", priceMode: "fixed", priceCents: 110000 }),
    listing({ id: "b", priceMode: "margin", marginBps: 2000 }),
    listing({ id: "c", priceMode: "from", priceCents: 200000 }),
    listing({ id: "d", priceMode: "fixed", priceCents: 90000, status: "hidden" }),
  ];
  assert.deepEqual(listingsBreachedByTalentPrice(ls, 120000), ["a"]);
});

test("only accepted, unbreached listings are sellable", () => {
  assert.equal(isListingSellable(listing({})), true);
  assert.equal(isListingSellable(listing({ status: "offered" })), false);
  assert.equal(isListingSellable(listing({ status: "hidden" })), false);
  assert.equal(isListingSellable(listing({ floorBreachedAt: "2026-10-19T00:00:00Z" })), false);
});

test("exclusive talents: only the exclusive workspace or the Tulala hub may list them", () => {
  assert.equal(canListForWorkspace({ exclusiveTenantId: null, targetTenantId: "w2", targetIsHub: false }), true);
  assert.equal(canListForWorkspace({ exclusiveTenantId: "w1", targetTenantId: "w1", targetIsHub: false }), true);
  assert.equal(canListForWorkspace({ exclusiveTenantId: "w1", targetTenantId: "hub", targetIsHub: true }), true);
  assert.equal(canListForWorkspace({ exclusiveTenantId: "w1", targetTenantId: "w2", targetIsHub: false }), false);
});

test("validation: margin needs a rate, fixed/from need a price, instant booking needs a fixed price", () => {
  assert.equal(validateListingInput(listing({ priceMode: "margin", marginBps: null })).ok, false);
  assert.equal(validateListingInput(listing({ priceMode: "fixed", priceCents: null })).ok, false);
  assert.equal(validateListingInput(listing({ priceMode: "from", priceCents: 5000, bookingType: "instant" })).ok, false);
  assert.equal(validateListingInput(listing({ priceMode: "fixed", priceCents: 5000, bookingType: "instant" })).ok, true);
  assert.equal(validateListingInput(listing({ talentLowestCents: -1 })).ok, false);
});

test("hub display: price in the talent's currency, approximate line in the workspace currency", () => {
  const rates = { rateDate: "2026-10-19", perUsd: { USD: 1, MXN: 20 } };
  const d = hubPriceDisplay({ amountCents: 200000, serviceCurrency: "MXN", workspaceCurrency: "USD", usdRates: rates, locale: "en" });
  assert.match(d.primary, /2,000/);
  assert.match(d.secondary ?? "", /^≈ /);
  assert.match(d.secondary ?? "", /100/);
  assert.equal(hubPriceDisplay({ amountCents: 200000, serviceCurrency: "MXN", workspaceCurrency: "MXN", usdRates: rates, locale: "en" }).secondary, null);
  assert.equal(hubPriceDisplay({ amountCents: 200000, serviceCurrency: "MXN", workspaceCurrency: "USD", usdRates: null, locale: "en" }).secondary, null);
});

test("listing strings exist in EN and ES with the same keys and no em dashes", () => {
  const enB = (en as { dashboard: Record<string, Record<string, string>> }).dashboard.serviceHubListing;
  const esB = (es as { dashboard: Record<string, Record<string, string>> }).dashboard.serviceHubListing;
  assert.ok(enB && esB, "dashboard.serviceHubListing block missing");
  assert.deepEqual(Object.keys(enB).sort(), Object.keys(esB).sort());
  for (const v of [...Object.values(enB), ...Object.values(esB)]) assert.equal(String(v).includes("—"), false);
});
