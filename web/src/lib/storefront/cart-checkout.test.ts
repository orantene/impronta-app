import assert from "node:assert/strict";
import { test } from "node:test";

import type { PurchaseResult } from "@/lib/orders/purchase-types";

import { actCartCheckoutCore, readCartCheckoutCore, type CartCheckoutDeps } from "./cart-checkout.core";
import { fakeAdmin, uuid, type FakeStore } from "./__fixtures__/fake-admin";
import { memoryIdempotentRunner } from "./__fixtures__/memory-runner";

const TENANT = uuid(1);
const TACO = uuid(2);
const CART = uuid(10);
const FOREIGN = uuid(11);
const CUSTOMER = uuid(30);
const PROMO = uuid(40);
const GUEST = "web:guest-abc";

function setup(over: Partial<CartCheckoutDeps> = {}, rows: FakeStore = {}) {
  const { admin, store, calls } = fakeAdmin({
    orders: [
      { id: CART, tenant_id: TENANT, status: "draft", currency: "USD", customer_id: null, guest_session_id: GUEST, source_channel: "storefront:pickup", source_page: "/menu", space_id: null, version: 3, subtotal_cents: 600, discount_cents: 0, tax_cents: 0, total_cents: 600, tip_cents: 0, promo_code_id: null, requires_identity: false, created_at: "2026-09-15T00:00:00Z" },
      { id: FOREIGN, tenant_id: TENANT, status: "draft", currency: "USD", customer_id: null, guest_session_id: "web:someone-else", source_channel: "storefront", version: 1, subtotal_cents: 0, discount_cents: 0, tax_cents: 0, total_cents: 0, created_at: "2026-09-15T00:00:00Z" },
    ],
    order_lines: [{ id: uuid(20), order_id: CART, offering_id: TACO, variant_id: null, addon_ids: [], label: "Taco", units: 2, unit_cents: 300, total_cents: 600, sort_order: 0 }],
    customers: [{ id: CUSTOMER, tenant_id: TENANT, display_name: "Ana", email: "ana@example.com", phone_e164: null, user_id: null }],
    tenant_promo_codes: [{ id: PROMO, code: "HOLA10" }],
    ...rows,
  });
  const memory = memoryIdempotentRunner();
  const purchases: unknown[] = [];
  const mutations: string[] = [];
  const deps: CartCheckoutDeps = {
    admin,
    runner: memory.runner,
    identity: { guestKey: "guest-abc", userId: null, email: null, displayName: null },
    locale: "en",
    origin: "https://shop.test",
    addLine: async (_a, i) => {
      mutations.push(`add:${i.expectedVersion ?? "-"}`);
      if (i.expectedVersion != null && i.expectedVersion !== 3) return { ok: false, reason: "conflict", error: "changed" };
      return { ok: true, orderId: i.orderId, lineId: uuid(21) };
    },
    updateLine: async (_a, i) => {
      mutations.push("update");
      return { ok: true, orderId: i.orderId };
    },
    removeLine: async (_a, i) => {
      mutations.push("remove");
      return { ok: true, orderId: i.orderId };
    },
    reprice: async (_a, i, d) => {
      const resolved = await d.resolvePromo({ tenantId: i.tenantId, code: i.promoCode ?? "", customerId: CUSTOMER, lines: [] });
      if (!resolved.ok) return { ok: false, reason: "promo_refused", error: resolved.error };
      return { ok: true, orderId: i.orderId, discountCents: resolved.discountCents };
    },
    resolvePromo: async (_a, i) => (i.code === "HOLA10" ? { ok: true, codeId: PROMO, discountCents: 60 } : { ok: false, reason: "promo_expired" }),
    setTip: async (_a, i) => ({ ok: true, orderId: i.orderId, tipCents: i.tipCents, totalCents: 600 + i.tipCents, version: i.expectedVersion + 1 }),
    ensureCustomer: async () => ({ ok: true, customerId: CUSTOMER, created: false, identity: { email: "ana@example.com", phoneE164: null, displayName: "Ana" } }),
    createPurchase: async (_a, input) => {
      purchases.push(input);
      return {
        ok: true, orderId: uuid(50), customerId: CUSTOMER, totalCents: 600, collectCents: 600, payInPerson: false,
        allocationIds: [], transactionId: uuid(51), bookingId: uuid(52), inquiryId: null, reservationHoldId: null,
      } satisfies PurchaseResult;
    },
    createCheckout: async (i) => ({ ok: true, url: `https://pay.test/${i.transactionId}`, sessionId: "s", mock: true }),
    ...over,
  };
  store.orders!.push({ id: uuid(50), tenant_id: TENANT, status: "pending_payment", receipt_code: "SALE1234", currency: "USD" });
  return { deps, store, calls, purchases, mutations };
}

test("read: the guest's own open cart, shaped; none for a stranger", async () => {
  const { deps } = setup();
  const r = await readCartCheckoutCore(deps, TENANT, { modes: ["pickup", "at_table"], tipPresets: [0, 15] });
  assert.ok(r.ok);
  if (!r.ok) return;
  const o = r.data.order!;
  assert.equal(o.id, CART);
  assert.equal(o.version, 3);
  assert.equal(o.fulfilment, "pickup");
  assert.deepEqual(o.lines, [{ id: uuid(20), offeringId: TACO, variantId: null, addonIds: [], label: "Taco", units: 2, unitCents: 300, totalCents: 600 }]);
  assert.equal(o.customer, null);
  assert.equal(o.promo, null);
  assert.deepEqual(r.data.modes, ["pickup", "at_table"]);
  assert.deepEqual(r.data.tipPresets, [0, 15]);
  const { deps: stranger } = setup({ identity: { guestKey: "nobody", userId: null, email: null, displayName: null } });
  const s = await readCartCheckoutCore(stranger, TENANT, {});
  assert.ok(s.ok && s.data.order === null);
});

test("act create: hands back the existing cart; makes one when none; refuses with no identity at all", async () => {
  const { deps, store } = setup();
  const again = await actCartCheckoutCore(deps, { op: "create", tenantId: TENANT });
  assert.deepEqual(again, { ok: true, op: "create", orderId: CART, version: 3, already: true });
  const { deps: fresh, store: s2 } = setup({ identity: { guestKey: "new-guest", userId: null, email: null, displayName: null } });
  const made = await actCartCheckoutCore(fresh, { op: "create", tenantId: TENANT, fulfilment: "at_table" });
  assert.ok(made.ok && made.op === "create" && made.already === false);
  const row = s2.orders!.find((o) => o.guest_session_id === "web:new-guest")!;
  assert.equal(row.status, "draft");
  assert.equal(row.source_channel, "storefront:at_table");
  assert.ok(typeof row.receipt_code === "string" && (row.receipt_code as string).length >= 8);
  const { deps: none } = setup({ identity: { guestKey: null, userId: null, email: null, displayName: null } });
  const r = await actCartCheckoutCore(none, { op: "create", tenantId: TENANT });
  assert.ok(!r.ok && r.reason === "identity_required");
  assert.equal(store.orders!.length, 3);
});

test("act lines: a foreign cart is not_found; a stale version is conflict; a good version mutates through the draft commands", async () => {
  const { deps, mutations } = setup();
  const line = { offeringId: TACO, units: 1 };
  const foreign = await actCartCheckoutCore(deps, { op: "add_line", tenantId: TENANT, orderId: FOREIGN, line });
  assert.ok(!foreign.ok && foreign.reason === "refused" && foreign.code === "not_found");
  const stale = await actCartCheckoutCore(deps, { op: "add_line", tenantId: TENANT, orderId: CART, line }, 2);
  assert.ok(!stale.ok && stale.reason === "conflict");
  const ok = await actCartCheckoutCore(deps, { op: "add_line", tenantId: TENANT, orderId: CART, line }, 3);
  assert.deepEqual(ok, { ok: true, op: "add_line", orderId: CART, version: 3 });
  await actCartCheckoutCore(deps, { op: "update_line", tenantId: TENANT, orderId: CART, lineId: uuid(20), units: 3 }, 3);
  await actCartCheckoutCore(deps, { op: "remove_line", tenantId: TENANT, orderId: CART, lineId: uuid(20) }, 3);
  assert.deepEqual(mutations, ["add:2", "add:3", "update", "remove"]);
});

test("act promo: needs a named buyer; the resolver's own reason survives the reprice", async () => {
  const { deps, store } = setup();
  const anon = await actCartCheckoutCore(deps, { op: "apply_promo", tenantId: TENANT, orderId: CART, code: "HOLA10" });
  assert.ok(!anon.ok && anon.reason === "identity_required" && anon.code === "promo_needs_customer");
  store.orders![0]!.customer_id = CUSTOMER;
  const ok = await actCartCheckoutCore(deps, { op: "apply_promo", tenantId: TENANT, orderId: CART, code: "HOLA10" }, 3);
  assert.deepEqual(ok, { ok: true, op: "apply_promo", orderId: CART, version: 3, discountCents: 60 });
  const expired = await actCartCheckoutCore(deps, { op: "apply_promo", tenantId: TENANT, orderId: CART, code: "OLD" }, 3);
  assert.ok(!expired.ok && expired.reason === "refused" && expired.code === "promo_expired");
});

test("act set_fulfilment / set_tip / identify write the draft by version", async () => {
  const { deps, store } = setup();
  const mode = await actCartCheckoutCore(deps, { op: "set_fulfilment", tenantId: TENANT, orderId: CART, fulfilment: "delivery" }, 3);
  assert.deepEqual(mode, { ok: true, op: "set_fulfilment", orderId: CART, version: 3 });
  assert.equal(store.orders![0]!.source_channel, "storefront:delivery");
  const staleMode = await actCartCheckoutCore(deps, { op: "set_fulfilment", tenantId: TENANT, orderId: CART, fulfilment: "pickup" }, 1);
  assert.ok(!staleMode.ok && staleMode.reason === "conflict");
  const tip = await actCartCheckoutCore(deps, { op: "set_tip", tenantId: TENANT, orderId: CART, tipCents: 100 }, 3);
  assert.deepEqual(tip, { ok: true, op: "set_tip", orderId: CART, version: 4 });
  const noName = await actCartCheckoutCore(deps, { op: "identify", tenantId: TENANT, orderId: CART, contact: { name: "", email: "ana@example.com" } });
  assert.ok(!noName.ok && noName.reason === "identity_required");
  const named = await actCartCheckoutCore(deps, { op: "identify", tenantId: TENANT, orderId: CART, contact: { name: "Ana", email: "ana@example.com" } }, 3);
  assert.deepEqual(named, { ok: true, op: "identify", orderId: CART, version: 3 });
  assert.equal(store.orders![0]!.customer_id, CUSTOMER);
  assert.equal(store.orders![0]!.guest_session_id, GUEST, "the guest key stays so the browser can still reach its cart");
  const read = await readCartCheckoutCore(deps, TENANT, {});
  assert.ok(read.ok && read.data.order?.customer?.email === "ana@example.com");
});

test("act start_payment: identity-before-payment is the pipeline's no_contact; success closes the cart and is idempotent by cart id", async () => {
  let refuse: string | null = "no_contact";
  const { deps, store, purchases } = setup({
    createPurchase: async (_a, input) => {
      purchases.push(input);
      if (refuse) return { ok: false, reason: refuse as "no_contact" } as PurchaseResult;
      return { ok: true, orderId: uuid(50), customerId: CUSTOMER, totalCents: 600, collectCents: 600, payInPerson: false, allocationIds: [], transactionId: uuid(51), bookingId: uuid(52), inquiryId: null, reservationHoldId: null };
    },
  });
  const anon = await actCartCheckoutCore(deps, { op: "start_payment", tenantId: TENANT, orderId: CART, payment: "full" });
  assert.ok(!anon.ok && anon.reason === "identity_required");
  assert.equal(store.orders![0]!.status, "draft", "a refused payment leaves the cart open");
  refuse = "sold_out";
  const full = await actCartCheckoutCore(deps, { op: "start_payment", tenantId: TENANT, orderId: CART, payment: "full" });
  assert.ok(!full.ok && full.reason === "full");
  refuse = null;
  store.orders![0]!.customer_id = CUSTOMER;
  store.orders![0]!.promo_code_id = PROMO;
  const ok = await actCartCheckoutCore(deps, { op: "start_payment", tenantId: TENANT, orderId: CART, payment: "full" }, 3);
  assert.ok(ok.ok && ok.op === "start_payment");
  if (!ok.ok || ok.op !== "start_payment") return;
  assert.equal(ok.orderId, uuid(50));
  assert.equal(ok.receiptCode, "SALE1234");
  assert.equal(ok.receiptUrl, "https://shop.test/r/SALE1234");
  assert.equal(ok.checkoutUrl, `https://pay.test/${uuid(51)}`);
  assert.equal(store.orders![0]!.status, "cancelled", "the cart is spent");
  const sent = purchases[2] as { promoCode: string; contact: { email: string }; lines: Array<{ offeringId: string; units: number }>; sourceChannel: string; clientOrderKey: string };
  assert.equal(sent.promoCode, "HOLA10");
  assert.equal(sent.contact.email, "ana@example.com");
  assert.deepEqual(sent.lines, [{ offeringId: TACO, units: 2, variantId: null, addonIds: [] }]);
  assert.equal(sent.sourceChannel, "storefront:pickup");
  assert.equal(sent.clientOrderKey, `cart:${CART}`);
  // Same cart again from a stale tab: the same sale, no second purchase.
  const again = await actCartCheckoutCore(deps, { op: "start_payment", tenantId: TENANT, orderId: CART, payment: "full" }, 3);
  assert.ok(again.ok && again.op === "start_payment" && again.replayed === true && again.orderId === uuid(50));
  assert.equal(purchases.length, 3);
});

test("act start_payment: an empty cart and a stale version are refused before the pipeline", async () => {
  const { deps, purchases, store } = setup();
  const stale = await actCartCheckoutCore(deps, { op: "start_payment", tenantId: TENANT, orderId: CART, payment: "full" }, 2);
  assert.ok(!stale.ok && stale.reason === "conflict");
  store.order_lines = [];
  const empty = await actCartCheckoutCore(deps, { op: "start_payment", tenantId: TENANT, orderId: CART, payment: "in_person" });
  assert.ok(!empty.ok && empty.code === "empty_order");
  assert.equal(purchases.length, 0);
});
