/**
 * D-170: a buyer named on an open sale is written to `orders.customer_id`
 * NOW, so `repriceAndValidate` no longer refuses a code as
 * `promo_needs_customer` on a sale whose buyer the cashier just named.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { attachDraftCustomer } from "./attach-customer";
import { repriceAndValidate } from "./draft";
import { fakeAdmin, makeStore, type Row } from "./__fixtures__/pos-store";

const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ORDER = "33333333-3333-4333-8333-333333333333";
const CUSTOMER = "44444444-4444-4444-8444-444444444444";

function seed() {
  const store = makeStore() as ReturnType<typeof makeStore> & { customers: Row[] };
  store.customers = [{ id: CUSTOMER, tenant_id: TENANT, email: "laura@example.test" }];
  store.orders.push({
    id: ORDER, tenant_id: TENANT, status: "draft", customer_id: null, currency: "USD", version: 3,
    subtotal_cents: 1800, discount_cents: 0, tax_cents: 0, total_cents: 1800, tip_cents: 0, promo_code_id: null,
    guest_session_id: "g", source_page: "pos", visit_id: null, space_id: null,
  });
  return store;
}

const ensured: string[] = [];
const ensureCustomer = async (c: { email?: string | null; phone?: string | null }) => {
  ensured.push(c.email ?? c.phone ?? "");
  return { ok: true as const, customerId: CUSTOMER, created: false, identity: { email: c.email ?? null, phone: null, displayName: null } as never };
};

test("saving a draft buyer writes orders.customer_id on the open sale and bumps the version", async () => {
  const store = seed();
  const admin = fakeAdmin(store) as unknown as SupabaseClient;
  const result = await attachDraftCustomer(admin, { tenantId: TENANT, orderId: ORDER, expectedVersion: 3, email: "laura@example.test", displayName: "Laura" }, { ensureCustomer });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.customerId, CUSTOMER);
    assert.equal(result.version, 4);
    assert.equal(result.changed, true);
  }
  assert.equal(store.orders[0]?.customer_id, CUSTOMER);
  assert.equal(store.orders[0]?.version, 4);
  assert.deepEqual(ensured.splice(0), ["laura@example.test"]);
});

test("attaching is idempotent: the same buyer again writes nothing and keeps the version", async () => {
  const store = seed();
  store.orders[0]!.customer_id = CUSTOMER;
  const admin = fakeAdmin(store) as unknown as SupabaseClient;
  const result = await attachDraftCustomer(admin, { tenantId: TENANT, orderId: ORDER, customerId: CUSTOMER }, { ensureCustomer });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.changed, false);
    assert.equal(result.version, 3);
  }
  assert.equal(store.orders[0]?.version, 3);
});

test("a stale version is a conflict, a foreign customer is not found, a paid sale is not a draft", async () => {
  const store = seed();
  const admin = fakeAdmin(store) as unknown as SupabaseClient;
  const stale = await attachDraftCustomer(admin, { tenantId: TENANT, orderId: ORDER, expectedVersion: 2, customerId: CUSTOMER }, { ensureCustomer });
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.equal(stale.reason, "conflict");

  store.customers[0]!.tenant_id = OTHER;
  const foreign = await attachDraftCustomer(admin, { tenantId: TENANT, orderId: ORDER, customerId: CUSTOMER }, { ensureCustomer });
  assert.equal(foreign.ok, false);
  if (!foreign.ok) assert.equal(foreign.reason, "not_found");
  assert.equal(store.orders[0]?.customer_id, null);

  const nothing = await attachDraftCustomer(admin, { tenantId: TENANT, orderId: ORDER, displayName: "Nobody" }, { ensureCustomer });
  assert.equal(nothing.ok, false);
  if (!nothing.ok) assert.equal(nothing.reason, "invalid");

  store.orders[0]!.status = "paid";
  const paid = await attachDraftCustomer(admin, { tenantId: TENANT, orderId: ORDER, customerId: CUSTOMER }, { ensureCustomer });
  assert.equal(paid.ok, false);
  if (!paid.ok) assert.equal(paid.reason, "not_draft");
});

test("WIRE-2.13's path: named buyer, then a code reaches resolvePromo instead of promo_needs_customer", async () => {
  const store = seed();
  const admin = fakeAdmin(store) as unknown as SupabaseClient;
  const seen: Array<{ customerId: string }> = [];
  const resolvePromo = async (args: { customerId: string }) => {
    seen.push({ customerId: args.customerId });
    return { ok: false as const, reason: "over_limit" as const, error: "over" };
  };

  const before = await repriceAndValidate(admin, { tenantId: TENANT, orderId: ORDER, promoCode: "WIRE213" }, { resolvePromo });
  assert.equal(before.ok, false);
  if (!before.ok) assert.equal(before.reason, "promo_needs_customer");
  assert.equal(seen.length, 0);

  const attached = await attachDraftCustomer(admin, { tenantId: TENANT, orderId: ORDER, expectedVersion: 3, email: "laura@example.test" }, { ensureCustomer });
  assert.equal(attached.ok, true);

  const after = await repriceAndValidate(admin, { tenantId: TENANT, orderId: ORDER, promoCode: "WIRE213", expectedVersion: 4 }, { resolvePromo });
  assert.equal(after.ok, false);
  if (!after.ok) assert.equal(after.reason, "over_limit");
  assert.deepEqual(seen, [{ customerId: CUSTOMER }]);
});
