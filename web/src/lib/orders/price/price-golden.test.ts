/**
 * TUL-1298 golden invariance table: 30 selections, every CHARGED amount pinned.
 *
 * GOLDEN was captured from the charging code (`createPurchase`'s steps: pricePurchase, resolvePurchasePolicy,
 * resolveCheckoutCollectCents with the real pass-through code) BEFORE any display site moved onto the
 * price module. Three things must agree for each case:
 *   1. the charging steps still produce the pinned numbers (a change to a charged amount fails here),
 *   2. the price module shows exactly those numbers (what is displayed is what is charged),
 *   3. refusals stay refusals (deposit not offered, fractional units, variant required).
 * A deliberate charged-amount change (D2-B, P5) must edit this table in the same PR.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { CASES, moduleCharge, referenceCharge, type Outcome } from "./price-golden.fixture";

const GOLDEN: Record<string, Outcome> = {
  "01 single full": { ok: true, charged: { subtotalCents: 10000, totalCents: 10000, baseCollectCents: 10000, collectCents: 10000 } },
  "02 single full, seller pays card fee": { ok: true, charged: { subtotalCents: 10000, totalCents: 10000, baseCollectCents: 10000, collectCents: 10150 } },
  "03 single full, client pays card fee": { ok: true, charged: { subtotalCents: 10000, totalCents: 10000, baseCollectCents: 10000, collectCents: 10955 } },
  "04 three units": { ok: true, charged: { subtotalCents: 30000, totalCents: 30000, baseCollectCents: 30000, collectCents: 30000 } },
  "05 one add-on once per line": { ok: true, charged: { subtotalCents: 12000, totalCents: 12000, baseCollectCents: 12000, collectCents: 12000 } },
  "06 two add-ons, 2 units (add-ons once per line)": { ok: true, charged: { subtotalCents: 23500, totalCents: 23500, baseCollectCents: 23500, collectCents: 23500 } },
  "07 variant with its own price": { ok: true, charged: { subtotalCents: 8000, totalCents: 8000, baseCollectCents: 8000, collectCents: 8000 } },
  "08 variant with no price charges the offering price (TUL-1301)": { ok: true, charged: { subtotalCents: 10000, totalCents: 10000, baseCollectCents: 10000, collectCents: 10000 } },
  "09 promo 20% on 10000 (TUL-1304 sheet case)": { ok: true, charged: { subtotalCents: 10000, totalCents: 8000, baseCollectCents: 8000, collectCents: 8000 } },
  "10 promo 20% with seller card fee (10150 shown vs 8120 charged)": { ok: true, charged: { subtotalCents: 10000, totalCents: 8000, baseCollectCents: 8000, collectCents: 8120 } },
  "11 promo that makes it free": { ok: true, charged: { subtotalCents: 10000, totalCents: 0, baseCollectCents: 0, collectCents: 0 } },
  "12 deposit 30%": { ok: true, charged: { subtotalCents: 20000, totalCents: 20000, baseCollectCents: 6000, collectCents: 6000 } },
  "13 deposit 30% with seller card fee": { ok: true, charged: { subtotalCents: 20000, totalCents: 20000, baseCollectCents: 6000, collectCents: 6090 } },
  "14 deposit 30% with client-paid card fee": { ok: true, charged: { subtotalCents: 20000, totalCents: 20000, baseCollectCents: 6000, collectCents: 6719 } },
  "15 deposit floor: 1999 at 50% charges 999 (rail showed 1000)": { ok: true, charged: { subtotalCents: 1999, totalCents: 1999, baseCollectCents: 999, collectCents: 999 } },
  "16 deposit floor: 33333 at 30%": { ok: true, charged: { subtotalCents: 33333, totalCents: 33333, baseCollectCents: 9999, collectCents: 9999 } },
  "17 deposit on the promo total": { ok: true, charged: { subtotalCents: 20000, totalCents: 15000, baseCollectCents: 4500, collectCents: 4500 } },
  "18 deposit on the promo total with seller fee": { ok: true, charged: { subtotalCents: 20000, totalCents: 15000, baseCollectCents: 4500, collectCents: 4568 } },
  "19 two lines, two payees, full": { ok: true, charged: { subtotalCents: 25000, totalCents: 25000, baseCollectCents: 25000, collectCents: 25000 } },
  "20 two lines, two payees, full, seller fee": { ok: true, charged: { subtotalCents: 25000, totalCents: 25000, baseCollectCents: 25000, collectCents: 25375 } },
  "21 two deposit lines use the smallest % (30)": { ok: true, charged: { subtotalCents: 35000, totalCents: 35000, baseCollectCents: 10500, collectCents: 10500 } },
  "22 two deposit lines, seller fee": { ok: true, charged: { subtotalCents: 35000, totalCents: 35000, baseCollectCents: 10500, collectCents: 10658 } },
  "23 two deposit lines with a promo": { ok: true, charged: { subtotalCents: 50000, totalCents: 46500, baseCollectCents: 13950, collectCents: 13950 } },
  "24 pay in person charges nothing now": { ok: true, charged: { subtotalCents: 8000, totalCents: 8000, baseCollectCents: 0, collectCents: 0 } },
  "25 free reserve charges nothing now": { ok: true, charged: { subtotalCents: 5000, totalCents: 5000, baseCollectCents: 0, collectCents: 0 } },
  "26 full with add-ons and promo and client fee": { ok: true, charged: { subtotalCents: 22000, totalCents: 20900, baseCollectCents: 20900, collectCents: 22502 } },
  "27 variant + promo + seller fee": { ok: true, charged: { subtotalCents: 8000, totalCents: 7200, baseCollectCents: 7200, collectCents: 7308 } },
  "28 deposit not offered is refused (full-pay offering)": { ok: false, reason: "deposit_not_offered" },
  "29 fractional quantity is refused": { ok: false, reason: "invalid_units" },
  "30 variant required when the offering has tiers": { ok: false, reason: "variant_required" },
};

test("the table has exactly 30 cases and every case is pinned", () => {
  assert.equal(CASES.length, 30);
  assert.deepEqual(Object.keys(GOLDEN).sort(), CASES.map((c) => c.id).sort());
});

for (const c of CASES) {
  test(`golden ${c.id}: charged amounts are unchanged and the module shows the same numbers`, async () => {
    const pinned = GOLDEN[c.id];
    assert.deepEqual(await referenceCharge(c), pinned, "the charging steps changed a charged amount");
    assert.deepEqual(await moduleCharge(c), pinned, "the price module disagrees with what is charged");
  });
}

test("TUL-1304 numbers: the sheet shows what is charged (8120, not 10150) and the rail deposit is 999, not 1000", async () => {
  const promoFee = GOLDEN["10 promo 20% with seller card fee (10150 shown vs 8120 charged)"];
  assert.ok(promoFee?.ok && promoFee.charged.collectCents === 8_120);
  const rail = GOLDEN["15 deposit floor: 1999 at 50% charges 999 (rail showed 1000)"];
  assert.ok(rail?.ok && rail.charged.collectCents === 999);
});

test("TUL-1301 number: a tier with no price is charged the offering price (5000 x 2 = 10000), so it must not show Free", async () => {
  const tier = GOLDEN["08 variant with no price charges the offering price (TUL-1301)"];
  assert.ok(tier?.ok && tier.charged.totalCents === 10_000);
});
