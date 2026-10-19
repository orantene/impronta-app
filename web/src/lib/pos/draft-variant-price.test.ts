/**
 * TUL-1330 [MONEY]: the table QR could sell a size/option-priced dish at $0.
 * Menu-imported tier-only dishes have amount_cents null; the QR client sent
 * only offering id + quantity and addLine priced the line at 0.
 *
 * Run: node_modules/.bin/tsx --require ./scripts/register-server-only-test.cjs --test src/lib/pos/draft-variant-price.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { addLine, createDraftOrder } from "./draft";
import { fakeAdmin, makeStore, seedOffering, type Row } from "./__fixtures__/commands-store";

function withVariants(store: ReturnType<typeof makeStore>) {
  const extra = store as ReturnType<typeof makeStore> & { talent_offering_variants: Row[]; talent_offering_addons: Row[] };
  extra.talent_offering_variants = [];
  extra.talent_offering_addons = [];
  return extra;
}

async function draftFor(store: ReturnType<typeof makeStore>) {
  const created = await createDraftOrder(fakeAdmin(store), { tenantId: "t1", actorUserId: "u1" });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("no draft");
  return created.orderId;
}

function tierDish() {
  const store = withVariants(makeStore());
  seedOffering(store, { id: "taco", title: "Tacos", amount_cents: null, talent_profile_id: null });
  store.talent_offering_variants.push({ id: "v-small", offering_id: "taco", label: "Small", amount_cents: 9_000 });
  store.talent_offering_variants.push({ id: "v-large", offering_id: "taco", label: "Large", amount_cents: 14_000 });
  return store;
}

test("a tier-priced dish with no option chosen is refused on the guest QR channel, never a $0 line", async () => {
  const store = tierDish();
  const orderId = await draftFor(store);
  const added = await addLine(fakeAdmin(store), {
    tenantId: "t1", orderId, proposedBy: "client", line: { offeringId: "taco", units: 1 },
  });
  assert.equal(added.ok, false);
  if (!added.ok) assert.equal(added.reason, "invalid");
  assert.equal(store.order_lines.length, 0);
});

test("the same refusal holds for any channel (counter, quote): no option, no price, no line", async () => {
  const store = tierDish();
  const orderId = await draftFor(store);
  const added = await addLine(fakeAdmin(store), { tenantId: "t1", orderId, line: { offeringId: "taco", units: 1 } });
  assert.equal(added.ok, false);
  assert.equal(store.order_lines.length, 0);
});

test("with an option chosen the server prices it from the option row", async () => {
  const store = tierDish();
  const orderId = await draftFor(store);
  const added = await addLine(fakeAdmin(store), {
    tenantId: "t1", orderId, proposedBy: "client", line: { offeringId: "taco", units: 2, variantId: "v-large" },
  });
  assert.equal(added.ok, true);
  assert.equal(store.order_lines[0].unit_cents, 14_000);
  assert.equal(store.order_lines[0].total_cents, 28_000);
});

test("a guest line that resolves to an unset price is refused; a genuinely free item still sells", async () => {
  const unset = withVariants(makeStore());
  seedOffering(unset, { id: "mystery", title: "Mystery", amount_cents: null, talent_profile_id: null });
  const unsetOrder = await draftFor(unset);
  const refused = await addLine(fakeAdmin(unset), {
    tenantId: "t1", orderId: unsetOrder, proposedBy: "client", line: { offeringId: "mystery", units: 1 },
  });
  assert.equal(refused.ok, false);
  assert.equal(unset.order_lines.length, 0);

  const free = withVariants(makeStore());
  seedOffering(free, { id: "water", title: "Water", amount_cents: 0, talent_profile_id: null });
  const freeOrder = await draftFor(free);
  const ok = await addLine(fakeAdmin(free), {
    tenantId: "t1", orderId: freeOrder, proposedBy: "client", line: { offeringId: "water", units: 1 },
  });
  assert.equal(ok.ok, true);
});

test("a plainly priced item with no options is untouched", async () => {
  const store = withVariants(makeStore());
  seedOffering(store, { id: "latte", title: "Latte", amount_cents: 6_500, talent_profile_id: null });
  const orderId = await draftFor(store);
  const added = await addLine(fakeAdmin(store), {
    tenantId: "t1", orderId, proposedBy: "client", line: { offeringId: "latte", units: 1 },
  });
  assert.equal(added.ok, true);
  assert.equal(store.order_lines[0].unit_cents, 6_500);
});
