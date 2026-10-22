import { test } from "node:test";
import assert from "node:assert/strict";
import { addLine, createDraftOrder } from "./draft";
import { startCollection } from "./collection";
import { fakeAdmin, fakeDraftAdmin, makeStore } from "./__fixtures__/pos-store";

// TUL-690: a POS card sale with the buyer's email must not record the cashier as the payer,
// or the later email claim (payer_user_id IS NULL) can never attach the payment to the buyer.
test("POS card collection leaves payer_user_id null and keeps the buyer email", async () => {
  const store = makeStore();
  store.talent_offerings.push({
    id: "off-1",
    tenant_id: "t1",
    title: "Table for two",
    amount_cents: 9000,
    currency: "USD",
    talent_profile_id: null,
    status: "published",
  });
  const created = await createDraftOrder(fakeDraftAdmin(store), { tenantId: "t1", actorUserId: "staff-1" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  await addLine(fakeDraftAdmin(store), { tenantId: "t1", orderId: created.orderId, line: { offeringId: "off-1", units: 1 } });
  const result = await startCollection(
    fakeAdmin(store),
    {
      tenantId: "t1",
      orderId: created.orderId,
      actorUserId: "staff-1",
      method: "card",
      contact: { email: "buyer@example.com" },
      successUrl: "https://app.test/ok",
      cancelUrl: "https://app.test/no",
      idempotencyKey: "pos-card:payer:1",
    },
    {
      ensureCustomer: async () => ({
        ok: true as const,
        customerId: "cust-1",
        created: true,
        identity: { email: "buyer@example.com", phoneE164: null, displayName: null },
      }),
      createPaymentRequest: async () => ({ ok: true as const, requestId: "req-1", checkoutUrl: "https://pay.test/c", mock: false }),
    },
  );
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(store.booking_transactions.length, 1);
  assert.equal(store.booking_transactions[0].payer_user_id, null);
  assert.equal(store.booking_transactions[0].payer_email, "buyer@example.com");
});
