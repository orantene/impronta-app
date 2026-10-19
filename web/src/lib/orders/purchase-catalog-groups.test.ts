import assert from "node:assert/strict";
import { test } from "node:test";
import { groupExtrasToPricedAddons } from "./purchase-catalog-groups";
import { pricePurchase, type PricedOffering } from "./purchase-pricing";

const offering = (id: string): PricedOffering => ({
  offeringId: id,
  label: "Cut",
  amountCents: 5000,
  currency: "MXN",
  priceType: "fixed",
  talentProfileId: "tal1",
  ownerTenantId: null,
  talentCostCents: 5000,
});
const cat = (addons: ReturnType<typeof groupExtrasToPricedAddons>) => ({
  offerings: new Map([["off1", offering("off1")], ["off2", offering("off2")]]),
  variants: new Map(),
  addons: new Map(addons.map((a) => [a.addonId, a])),
});

test("5c: a shared extra (group id) prices instead of refusing addon_not_on_offering", () => {
  const addons = groupExtrasToPricedAddons(
    [{ id: "grp1", talentProfileId: "tal1", name: "Beard trim", amountCents: 1500 }],
    [{ groupId: "grp1", offeringId: "off1" }],
    new Map([["off1", "tal1"]]),
  );
  const r = pricePurchase([{ offeringId: "off1", units: 1, addonIds: ["grp1"] }], cat(addons));
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.lines[0]!.totalCents, 6500);
  assert.deepEqual(r.ok && r.lines[0]!.addonIds, ["grp1"]);
});

test("5c: the same group id on an offering it is NOT attached to still refuses", () => {
  const addons = groupExtrasToPricedAddons(
    [{ id: "grp1", talentProfileId: "tal1", name: "Beard trim", amountCents: 1500 }],
    [{ groupId: "grp1", offeringId: "off1" }],
    new Map([["off1", "tal1"], ["off2", "tal1"]]),
  );
  const r = pricePurchase([{ offeringId: "off2", units: 1, addonIds: ["grp1"] }], cat(addons));
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, "addon_not_on_offering");
});

test("5c: a group attached to two offerings prices on both", () => {
  const addons = groupExtrasToPricedAddons(
    [{ id: "grp1", talentProfileId: "tal1", name: "Wax", amountCents: 500 }],
    [{ groupId: "grp1", offeringId: "off1" }, { groupId: "grp1", offeringId: "off2" }],
    new Map([["off1", "tal1"], ["off2", "tal1"]]),
  );
  for (const id of ["off1", "off2"]) {
    const r = pricePurchase([{ offeringId: id, units: 1, addonIds: ["grp1"] }], cat(addons));
    assert.equal(r.ok, true);
  }
});

test("5c: a group owned by another talent is never priced onto this offering", () => {
  const addons = groupExtrasToPricedAddons(
    [{ id: "grp9", talentProfileId: "other", name: "X", amountCents: 100 }],
    [{ groupId: "grp9", offeringId: "off1" }],
    new Map([["off1", "tal1"]]),
  );
  assert.equal(addons.length, 0);
});

test("5c: a malformed group price is dropped, never priced as zero", () => {
  const addons = groupExtrasToPricedAddons(
    [{ id: "g", talentProfileId: "tal1", name: "X", amountCents: null }],
    [{ groupId: "g", offeringId: "off1" }],
    new Map([["off1", "tal1"]]),
  );
  assert.equal(addons.length, 0);
});
