import { test } from "node:test";
import assert from "node:assert/strict";

import { addLine, createDraftOrder } from "./draft";
import { fakeAdmin, makeStore, seedOffering, type Row } from "./__fixtures__/commands-store";

function withChildren(store: ReturnType<typeof makeStore>) {
  const extra = store as ReturnType<typeof makeStore> & {
    talent_offering_variants: Row[];
    talent_offering_addons: Row[];
  };
  extra.talent_offering_variants = [];
  extra.talent_offering_addons = [];
  return extra;
}

test("a talent line uses her option and extras, in the offering currency", async () => {
  const store = withChildren(makeStore());
  seedOffering(store, {
    id: "gel",
    title: "Soft Gel Largo",
    amount_cents: 50_000,
    currency: "MXN",
    talent_profile_id: "jor",
  });
  store.talent_offering_variants.push({
    id: "v3",
    offering_id: "gel",
    label: "Soft Gel Largo #3",
    amount_cents: 55_000,
  });
  store.talent_offering_addons.push({
    id: "ojo",
    offering_id: "gel",
    label: "ojo de gato",
    amount_cents: 10_000,
  });
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1", currency: "MXN" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const added = await addLine(fakeAdmin(store), {
    tenantId: "t1",
    orderId: created.orderId,
    line: { offeringId: "gel", units: 1, variantId: "v3", addonIds: ["ojo"] },
  });
  assert.equal(added.ok, true);
  if (!added.ok) return;
  assert.equal(store.order_lines[0].label, "Soft Gel Largo #3 + ojo de gato");
  assert.equal(store.order_lines[0].unit_cents, 55_000);
  assert.equal(store.order_lines[0].total_cents, 65_000);
  assert.equal(store.orders[0].currency, "MXN");
});

test("MXN cents are refused on a USD sale", async () => {
  const store = makeStore();
  seedOffering(store, { currency: "MXN", talent_profile_id: "jor", amount_cents: 55_000 });
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const added = await addLine(fakeAdmin(store), {
    tenantId: "t1",
    orderId: created.orderId,
    line: { offeringId: "off-1", units: 1 },
  });
  assert.equal(added.ok, false);
  if (!added.ok) assert.equal(added.reason, "invalid");
  assert.equal(store.order_lines.length, 0);
});

test("an agency option still joins with a middot", async () => {
  const store = withChildren(makeStore());
  seedOffering(store, { title: "Gel manicure", talent_profile_id: null });
  store.talent_offering_variants.push({
    id: "short",
    offering_id: "off-1",
    label: "Short",
    amount_cents: 4_500,
  });
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const added = await addLine(fakeAdmin(store), {
    tenantId: "t1",
    orderId: created.orderId,
    line: { offeringId: "off-1", units: 1, variantId: "short" },
  });
  assert.equal(added.ok, true);
  assert.equal(store.order_lines[0].label, "Gel manicure · Short");
});
