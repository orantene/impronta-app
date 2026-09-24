import assert from "node:assert/strict";
import { test } from "node:test";

import type { PurchaseResult } from "@/lib/orders/purchase-types";

import { actPackageSelectorCore, readPackageSelectorCore, type PackageSelectorDeps } from "./package-selector.core";
import { fakeAdmin, uuid } from "./__fixtures__/fake-admin";
import { memoryIdempotentRunner } from "./__fixtures__/memory-runner";

const TENANT = uuid(1);
const PKG = uuid(2);
const TACO = uuid(3);

function setup(over: Partial<PackageSelectorDeps> = {}) {
  const base = { tenant_id: TENANT, status: "published", moderation_state: "approved", visibility: "public", currency: "USD", price_type: "flat_package", price_display: "exact" };
  const { admin } = fakeAdmin({
    talent_offerings: [
      { ...base, id: PKG, kind: "package", title: "Combo", amount_cents: 900, allow_pay_in_person: true },
      { ...base, id: TACO, kind: "product", title: "Taco", amount_cents: 300 },
    ],
    offering_components: [{ tenant_id: TENANT, offering_id: PKG, component_offering_id: TACO, qty: 3, required: true }],
    orders: [{ id: uuid(50), receipt_code: "PKG12345" }],
  });
  const purchases: unknown[] = [];
  const deps: PackageSelectorDeps = {
    admin,
    runner: memoryIdempotentRunner().runner,
    identity: { guestKey: "g", userId: null, email: null, displayName: null },
    locale: "en",
    origin: "https://shop.test",
    livePrice: async () => ({ ok: true, priceCents: 800, phaseId: uuid(7) }),
    createPurchase: async (_a, input) => {
      purchases.push(input);
      return { ok: true, orderId: uuid(50), customerId: uuid(51), totalCents: 800, collectCents: 800, currency: "USD", payInPerson: false, allocationIds: [], transactionId: uuid(52), bookingId: uuid(53), inquiryId: null, reservationHoldId: null } satisfies PurchaseResult;
    },
    createCheckout: async (i) => ({ ok: true, url: `https://pay.test/${i.transactionId}`, sessionId: "s", mock: true }),
    ...over,
  };
  return { deps, purchases };
}

test("read: packages with components and the live price", async () => {
  const { deps } = setup();
  const r = await readPackageSelectorCore(deps, TENANT, {});
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.data.packages.length, 1);
  const p = r.data.packages[0]!;
  assert.equal(p.title, "Combo");
  assert.equal(p.amountCents, 900);
  assert.equal(p.livePriceCents, 800);
  assert.deepEqual(p.components, [{ offeringId: TACO, title: "Taco", qty: 3, required: true }]);
  const none = await readPackageSelectorCore(deps, TENANT, { packageIds: [uuid(99)] });
  assert.ok(none.ok && none.data.packages.length === 0);
});

const INPUT = { tenantId: TENANT, packageId: PKG, contact: { name: "Ana", email: "ana@example.com" }, payment: "full" as const, clientOrderKey: "pkg-key-0001" };

test("act: refuses without identity; buys through createPurchase; replays by key; maps refusals", async () => {
  const { deps, purchases } = setup();
  const anon = await actPackageSelectorCore(deps, { ...INPUT, contact: { name: "Ana", email: "" } });
  assert.ok(!anon.ok && anon.reason === "identity_required");
  const notPkg = await actPackageSelectorCore(deps, { ...INPUT, packageId: TACO });
  assert.ok(!notPkg.ok && notPkg.code === "not_sellable");
  const ok = await actPackageSelectorCore(deps, INPUT);
  assert.ok(ok.ok);
  if (!ok.ok) return;
  assert.equal(ok.receiptUrl, "https://shop.test/r/PKG12345");
  assert.equal(ok.checkoutUrl, `https://pay.test/${uuid(52)}`);
  const again = await actPackageSelectorCore(deps, INPUT);
  assert.ok(again.ok && again.replayed === true);
  assert.equal(purchases.length, 1);
  const { deps: sold } = setup({ createPurchase: async () => ({ ok: false, reason: "sold_out" }) });
  const r = await actPackageSelectorCore(sold, INPUT);
  assert.ok(!r.ok && r.reason === "full");
});
