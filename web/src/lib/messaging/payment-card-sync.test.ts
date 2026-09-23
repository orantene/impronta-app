import assert from "node:assert/strict";
import { test } from "node:test";

import { fakeAdmin, uuid } from "@/lib/storefront/__fixtures__/fake-admin";

import { syncPaymentCardsForRecord } from "./payment-card-sync";

const TENANT = uuid(1);
const INQUIRY = uuid(2);
const ORDER = uuid(3);

function seed(cardState?: string) {
  return fakeAdmin({
    conversation_records: [{ id: "cr-1", tenant_id: TENANT, inquiry_id: INQUIRY, record_kind: "order", record_id: ORDER, unlinked_at: null }],
    inquiry_messages: [
      { id: "m-1", tenant_id: TENANT, inquiry_id: INQUIRY, message_kind: "payment_request", card_payload: cardState ? { amountCents: 1800, state: cardState } : { amountCents: 1800 }, deleted_at: null },
      { id: "m-2", tenant_id: TENANT, inquiry_id: INQUIRY, message_kind: "text", card_payload: null, deleted_at: null },
    ],
  });
}

test("a paid record flips the thread's payment card to paid; other kinds untouched", async () => {
  const { admin, store } = seed();
  const result = await syncPaymentCardsForRecord(admin, { tenantId: TENANT, recordId: ORDER, paymentState: "paid" });
  assert.deepEqual(result, { ok: true, updated: 1 });
  assert.equal(store.inquiry_messages[0].card_payload.state, "paid");
  assert.equal(store.inquiry_messages[0].card_payload.amountCents, 1800);
  assert.equal(store.inquiry_messages[1].card_payload, null);
});

test("a refund keeps the card paid and never reopens Pay", async () => {
  const { admin, store } = seed("paid");
  const result = await syncPaymentCardsForRecord(admin, { tenantId: TENANT, recordId: ORDER, paymentState: "refunded" });
  assert.deepEqual(result, { ok: true, updated: 0 });
  assert.equal(store.inquiry_messages[0].card_payload.state, "paid");
});

test("cancelled closes the card; an unsettled state writes nothing", async () => {
  const cancelled = seed();
  assert.deepEqual(await syncPaymentCardsForRecord(cancelled.admin, { tenantId: TENANT, recordId: ORDER, paymentState: "cancelled" }), { ok: true, updated: 1 });
  assert.equal(cancelled.store.inquiry_messages[0].card_payload.state, "cancelled");

  const pending = seed();
  assert.deepEqual(await syncPaymentCardsForRecord(pending.admin, { tenantId: TENANT, recordId: ORDER, paymentState: "requested" }), { ok: true, updated: 0 });
  assert.equal(pending.store.inquiry_messages[0].card_payload.state, undefined);
});

test("no linked record writes nothing", async () => {
  const { admin, store } = seed();
  const result = await syncPaymentCardsForRecord(admin, { tenantId: TENANT, recordId: uuid(9), paymentState: "paid" });
  assert.deepEqual(result, { ok: true, updated: 0 });
  assert.equal(store.inquiry_messages[0].card_payload.state, undefined);
});
