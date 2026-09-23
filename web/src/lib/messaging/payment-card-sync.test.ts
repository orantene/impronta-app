import assert from "node:assert/strict";
import { test } from "node:test";

import { fakeAdmin, uuid } from "@/lib/storefront/__fixtures__/fake-admin";

import { syncPaymentCardsForRecord } from "./payment-card-sync";

const TENANT = uuid(1);
const INQUIRY = uuid(2);
const ORDER = uuid(3);

type CardRow = { id: string; card_payload: Record<string, unknown> | null };
const payload = (store: Record<string, unknown[]>, i: number) => (store.inquiry_messages[i] as CardRow).card_payload;

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
  assert.equal(payload(store, 0)?.state, "paid");
  assert.equal(payload(store, 0)?.amountCents, 1800);
  assert.equal(payload(store, 1), null);
});

test("a refund keeps the card paid and never reopens Pay", async () => {
  const { admin, store } = seed("paid");
  const result = await syncPaymentCardsForRecord(admin, { tenantId: TENANT, recordId: ORDER, paymentState: "refunded" });
  assert.deepEqual(result, { ok: true, updated: 0 });
  assert.equal(payload(store, 0)?.state, "paid");
});

test("a refund on an unsettled card still marks it paid: the money did arrive", async () => {
  const { admin, store } = seed();
  const result = await syncPaymentCardsForRecord(admin, { tenantId: TENANT, recordId: ORDER, paymentState: "partially_refunded" });
  assert.deepEqual(result, { ok: true, updated: 1 });
  assert.equal(payload(store, 0)?.state, "paid");
});

test("an in-flight state writes nothing, so the card still shows Pay", async () => {
  for (const state of ["requested", "opened", "failed", "expired", "none"] as const) {
    const pending = seed();
    assert.deepEqual(await syncPaymentCardsForRecord(pending.admin, { tenantId: TENANT, recordId: ORDER, paymentState: state }), { ok: true, updated: 0 });
    assert.equal(payload(pending.store, 0)?.state, undefined);
  }
});

test("a client with no `from` cannot mirror the card and says so without throwing", async () => {
  const result = await syncPaymentCardsForRecord({}, { tenantId: TENANT, recordId: ORDER, paymentState: "paid" });
  assert.deepEqual(result, { ok: true, updated: 0 });
});

test("no linked record writes nothing", async () => {
  const { admin, store } = seed();
  const result = await syncPaymentCardsForRecord(admin, { tenantId: TENANT, recordId: uuid(9), paymentState: "paid" });
  assert.deepEqual(result, { ok: true, updated: 0 });
  assert.equal(payload(store, 0)?.state, undefined);
});

test("calls `from` as a method: a client whose from() needs `this` still works (D-MSG-342)", async () => {
  // The real SupabaseClient.from uses `this`. `const from = admin.from` detaches
  // it, which threw and was swallowed upstream, so the card silently never moved.
  const { admin } = seed();
  let sawThis = false;
  const clientLike = {
    _self: null as unknown,
    from(table: string) {
      // Throws exactly like the real client would when called detached.
      if (this === undefined || (this as { _self?: unknown })._self === undefined) {
        throw new TypeError("Cannot read properties of undefined (reading '_self')");
      }
      sawThis = true;
      return (admin as unknown as { from: (t: string) => unknown }).from(table);
    },
  };
  const result = await syncPaymentCardsForRecord(clientLike as never, {
    tenantId: TENANT,
    recordId: ORDER,
    paymentState: "paid",
  });
  assert.deepEqual(result, { ok: true, updated: 1 });
  assert.equal(sawThis, true);
});
