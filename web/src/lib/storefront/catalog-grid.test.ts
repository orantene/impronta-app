import assert from "node:assert/strict";
import { test } from "node:test";

import { readCatalogGridCore, type CatalogGridDeps } from "./catalog-grid.core";
import { fakeAdmin, uuid } from "./__fixtures__/fake-admin";

const TENANT = uuid(1);
const TACO = uuid(2);
const COMBO = uuid(3);
const SODA = uuid(4);
const PHASE = uuid(9);

function setup(over: Partial<CatalogGridDeps> = {}) {
  const base = { tenant_id: TENANT, status: "published", moderation_state: "approved", visibility: "public", owner_kind: "workspace", currency: "USD", price_type: "flat_package", price_display: "exact" };
  const { admin, calls } = fakeAdmin({
    talent_offerings: [
      { ...base, id: TACO, title: "Taco", description: "al pastor", kind: "product", category: "Food", amount_cents: 300, inventory_qty: 12, sort_order: 1, allow_pay_in_person: true },
      { ...base, id: COMBO, title: "Combo", kind: "package", category: "Deals", amount_cents: 900, sort_order: 2 },
      { ...base, id: SODA, title: "Soda", kind: "product", category: "Drinks", amount_cents: 150, sort_order: 3, status: "draft" },
    ],
    talent_offering_variants: [{ id: uuid(20), offering_id: TACO, label: "Doble", amount_cents: 450, sort_order: 0 }],
    talent_offering_addons: [{ id: uuid(21), offering_id: TACO, label: "Queso", amount_cents: 50, sort_order: 0 }],
    offering_components: [{ tenant_id: TENANT, offering_id: COMBO, component_offering_id: TACO, qty: 2, required: true }],
    offering_price_phases: [{ id: PHASE, label: "Happy hour" }],
  });
  const deps: CatalogGridDeps = {
    admin,
    locale: "en",
    livePrice: async (_a, i) => (i.offeringId === TACO ? { ok: true, priceCents: 250, phaseId: PHASE } : { ok: true, priceCents: null, phaseId: null }),
    loadImages: async () => new Map([[TACO, ["https://img/taco.jpg"]]]),
    ...over,
  };
  return { deps, calls };
}

test("read: published items only, shaped with options, extras, package components, live phase price and photo", async () => {
  const { deps } = setup();
  const r = await readCatalogGridCore(deps, TENANT, {});
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.data.items.map((i) => i.id), [TACO, COMBO], "the draft soda is not listed");
  const taco = r.data.items[0]!;
  assert.equal(taco.amountCents, 300);
  assert.equal(taco.livePriceCents, 250);
  assert.deepEqual(taco.phase, { id: PHASE, label: "Happy hour" });
  assert.deepEqual(taco.options, [{ id: uuid(20), label: "Doble", amountCents: 450 }]);
  assert.deepEqual(taco.addons, [{ id: uuid(21), label: "Queso", amountCents: 50 }]);
  assert.equal(taco.imageUrl, "https://img/taco.jpg");
  assert.equal(taco.unitsLeft, 12);
  assert.equal(taco.components, null);
  const combo = r.data.items[1]!;
  assert.equal(combo.livePriceCents, 900, "no phase → the base price");
  assert.equal(combo.phase, null);
  assert.deepEqual(combo.components, [{ offeringId: TACO, title: "Taco", qty: 2, required: true }]);
  assert.deepEqual(r.data.collections, [
    { key: "Food", label: "Food", itemIds: [TACO] },
    { key: "Deals", label: "Deals", itemIds: [COMBO] },
  ]);
  assert.deepEqual(r.data.promotions, []);
  assert.ok(!("amount_cents" in taco));
});

test("read: collections and offeringIds filter; photos and phases can be switched off; a failed phase read refuses", async () => {
  const { deps } = setup();
  const deals = await readCatalogGridCore(deps, TENANT, { collections: ["Deals"] });
  assert.ok(deals.ok && deals.data.items.length === 1 && deals.data.items[0]!.id === COMBO);
  const one = await readCatalogGridCore(deps, TENANT, { offeringIds: [TACO], showPhotos: false, showPhases: false });
  assert.ok(one.ok);
  if (!one.ok) return;
  assert.equal(one.data.items[0]!.imageUrl, null);
  assert.equal(one.data.items[0]!.livePriceCents, 300);
  const { deps: broken } = setup({ livePrice: async () => ({ ok: false, reason: "unavailable" }) });
  assert.deepEqual(await readCatalogGridCore(broken, TENANT, {}), { ok: false, reason: "unavailable" });
  assert.deepEqual(await readCatalogGridCore(deps, "nope", {}), { ok: false, reason: "invalid_request" });
});
