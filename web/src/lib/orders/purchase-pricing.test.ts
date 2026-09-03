/**
 * Purchase pricing — one implementation of a rule that used to exist twice.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pricePurchase,
  amountToCollectCents,
  MAX_ORDER_TOTAL_CENTS,
  type PricedOffering,
  type PricedVariant,
  type PricedAddon,
} from "@/lib/orders/purchase-pricing";

const TENANT = "tenant_1";

function offering(over: Partial<PricedOffering> = {}): PricedOffering {
  return {
    offeringId: "off_1",
    label: "Haircut",
    amountCents: 5000,
    priceType: "fixed",
    talentProfileId: null,
    ownerTenantId: TENANT,
    talentCostCents: 0,
    ...over,
  };
}

function catalog(
  offerings: PricedOffering[] = [offering()],
  variants: PricedVariant[] = [],
  addons: PricedAddon[] = [],
) {
  return {
    offerings: new Map(offerings.map((o) => [o.offeringId, o])),
    variants: new Map(variants.map((v) => [v.variantId, v])),
    addons: new Map(addons.map((a) => [a.addonId, a])),
  };
}

test("a simple line prices from the catalog row", () => {
  const r = pricePurchase([{ offeringId: "off_1", units: 2 }], catalog());
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.lines[0].unitCents, 5000);
  assert.equal(r.ok && r.lines[0].totalCents, 10000);
  assert.equal(r.ok && r.subtotalCents, 10000);
});

test("a variant OVERRIDES the base price", () => {
  const r = pricePurchase(
    [{ offeringId: "off_1", units: 1, variantId: "var_1" }],
    catalog([offering()], [{ variantId: "var_1", offeringId: "off_1", label: "Long", amountCents: 7500 }]),
  );
  assert.equal(r.ok && r.lines[0].unitCents, 7500);
  assert.equal(r.ok && r.lines[0].label, "Haircut — Long");
});

test("a variant belonging to ANOTHER offering is refused, not ignored", () => {
  const r = pricePurchase(
    [{ offeringId: "off_1", units: 1, variantId: "var_x" }],
    catalog([offering()], [{ variantId: "var_x", offeringId: "off_2", label: "X", amountCents: 100 }]),
  );
  // Ignoring it would silently charge the base price for the option the client
  // picked and thought they were buying.
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, "variant_not_on_offering");
});

test("an add-on is charged ONCE PER LINE, not per unit — preserving today's behaviour", () => {
  const r = pricePurchase(
    [{ offeringId: "off_1", units: 3, addonIds: ["add_1"] }],
    catalog([offering()], [], [{ addonId: "add_1", offeringId: "off_1", label: "Beard trim", amountCents: 1000 }]),
  );
  // 3 x 5000 + 1000 = 16000, which is exactly what instant-book-engine charges
  // today (`units: 1` hardcoded on add-on lines at :503-513).
  //
  // Folding the add-on into the unit price would give 18000 and is arguably
  // more correct for a per-unit extra — but the catalog cannot distinguish a
  // per-unit "beard trim" from a per-booking "travel fee", so changing it here
  // would ship a customer-facing money change as a side effect of a refactor.
  // Pinned deliberately; revisit when the catalog gains a per-unit flag.
  assert.equal(r.ok && r.lines[0].totalCents, 16000);
});

test("an add-on from another offering is refused", () => {
  const r = pricePurchase(
    [{ offeringId: "off_1", units: 1, addonIds: ["add_x"] }],
    catalog([offering()], [], [{ addonId: "add_x", offeringId: "off_2", label: "X", amountCents: 100 }]),
  );
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, "addon_not_on_offering");
});

test("a quote-style offering cannot be charged", () => {
  const r = pricePurchase([{ offeringId: "off_1", units: 1 }], catalog([offering({ priceType: "custom" })]));
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, "offering_not_priceable");
});

test("an offering with no price is refused rather than charged zero", () => {
  const r = pricePurchase([{ offeringId: "off_1", units: 1 }], catalog([offering({ amountCents: null })]));
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, "offering_not_priceable");
});

test("the payee XOR is carried through and never doubled", () => {
  const r = pricePurchase(
    [{ offeringId: "off_1", units: 1 }],
    catalog([offering({ talentProfileId: "tp_1", ownerTenantId: TENANT })]),
  );
  // Both set on the catalog row → talent wins, owner_tenant_id nulled, so the
  // order_lines XOR constraint cannot be violated.
  assert.equal(r.ok && r.lines[0].talentProfileId, "tp_1");
  assert.equal(r.ok && r.lines[0].ownerTenantId, null);
});

test("talent cost scales with units but NOT with add-ons", () => {
  const r = pricePurchase(
    [{ offeringId: "off_1", units: 2, addonIds: ["add_1"] }],
    catalog(
      [offering({ talentProfileId: "tp_1", ownerTenantId: null, talentCostCents: 3000 })],
      [],
      [{ addonId: "add_1", offeringId: "off_1", label: "Extra", amountCents: 1000 }],
    ),
  );
  // 2 x 3000. The add-on is house margin unless the catalog says otherwise;
  // inventing a talent cost for it would pay out money never promised.
  assert.equal(r.ok && r.lines[0].talentCostCents, 6000);
});

test("an order over the cap is refused", () => {
  const r = pricePurchase(
    [{ offeringId: "off_1", units: 999 }],
    catalog([offering({ amountCents: MAX_ORDER_TOTAL_CENTS })]),
  );
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, "amount_out_of_range");
});

// ── amountToCollectCents ─────────────────────────────────────────────────────

test("collect: full / none", () => {
  assert.equal(amountToCollectCents(10000, "full", null), 10000);
  assert.equal(amountToCollectCents(10000, "none", null), 0);
});

test("a deposit rounds DOWN, never up", () => {
  // 33% of 10001 = 3300.33. Rounding UP would collect more than the configured
  // percentage and leave a negative balance to explain to the client.
  assert.equal(amountToCollectCents(10001, "deposit", 33), 3300);
  assert.equal(amountToCollectCents(999, "deposit", 50), 499);
});

test("a nonsensical deposit percentage falls back to the full amount, never to zero", () => {
  for (const pct of [0, 100, 150, -10, null]) {
    assert.equal(amountToCollectCents(10000, "deposit", pct), 10000, `pct=${pct}`);
  }
});
