import assert from "node:assert/strict";
import { test } from "node:test";

import { fakeAdmin, uuid } from "@/lib/storefront/__fixtures__/fake-admin";

import { cardsMatchingRequest, stampInquiryPaidCards, syncPaymentCardsForRecord } from "./payment-card-sync";

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

test("A3: a full refund writes refunded (never reopens Pay)", async () => {
  const { admin, store } = seed("paid");
  const result = await syncPaymentCardsForRecord(admin, { tenantId: TENANT, recordId: ORDER, paymentState: "refunded" });
  assert.deepEqual(result, { ok: true, updated: 1 });
  assert.equal(payload(store, 0)?.state, "refunded");
});

test("A3: partially_refunded is written as its own state", async () => {
  const { admin, store } = seed();
  const result = await syncPaymentCardsForRecord(admin, { tenantId: TENANT, recordId: ORDER, paymentState: "partially_refunded" });
  assert.deepEqual(result, { ok: true, updated: 1 });
  assert.equal(payload(store, 0)?.state, "partially_refunded");
});

test("A3: expired writes expired on the card", async () => {
  const { admin, store } = seed();
  const result = await syncPaymentCardsForRecord(admin, { tenantId: TENANT, recordId: ORDER, paymentState: "expired" });
  assert.deepEqual(result, { ok: true, updated: 1 });
  assert.equal(payload(store, 0)?.state, "expired");
});

test("an in-flight state writes nothing, so the card still shows Pay", async () => {
  for (const state of ["requested", "opened", "failed", "none"] as const) {
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
  const { admin } = seed();
  let sawThis = false;
  const clientLike = {
    _self: null as unknown,
    from(table: string) {
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

test("a paid order stamps total, paid, due, currency, and method", async () => {
  const { admin, store } = fakeAdmin({
    conversation_records: [{ id: "cr-1", tenant_id: TENANT, inquiry_id: INQUIRY, record_kind: "order", record_id: ORDER, unlinked_at: null }],
    orders: [{ id: ORDER, total_cents: 5000, currency: "MXN" }],
    payment_links: [{ tenant_id: TENANT, order_id: ORDER, code: "pay_1", status: "paid" }],
    inquiry_messages: [
      {
        id: "m-1",
        tenant_id: TENANT,
        inquiry_id: INQUIRY,
        message_kind: "payment_request",
        card_payload: { amountCents: 2000, currency: "MXN", paymentLinkCode: "pay_1", state: "sent" },
        deleted_at: null,
      },
    ],
  });
  const result = await syncPaymentCardsForRecord(admin, { tenantId: TENANT, recordId: ORDER, paymentState: "paid" });
  assert.equal(result.ok, true);
  const card = (store.inquiry_messages[0] as { card_payload: Record<string, unknown> }).card_payload;
  assert.equal(card.state, "paid");
  assert.equal(card.totalCents, 5000);
  assert.equal(card.paidCents, 2000);
  assert.equal(card.dueCents, 3000);
  assert.equal(card.currency, "MXN");
  assert.equal(card.method, "card");
});

test("A3: two requests on one inquiry — only the paid link's card flips", async () => {
  const { admin, store } = fakeAdmin({
    conversation_records: [{ id: "cr-1", tenant_id: TENANT, inquiry_id: INQUIRY, record_kind: "order", record_id: ORDER, unlinked_at: null }],
    orders: [{ id: ORDER, total_cents: 5000, currency: "MXN" }],
    payment_links: [
      { tenant_id: TENANT, order_id: ORDER, code: "paid_code", status: "paid" },
      { tenant_id: TENANT, order_id: ORDER, code: "open_code", status: "open" },
    ],
    inquiry_messages: [
      {
        id: "m-paid",
        tenant_id: TENANT,
        inquiry_id: INQUIRY,
        message_kind: "payment_request",
        card_payload: { amountCents: 2000, currency: "MXN", paymentLinkCode: "paid_code", state: "sent" },
        deleted_at: null,
      },
      {
        id: "m-open",
        tenant_id: TENANT,
        inquiry_id: INQUIRY,
        message_kind: "payment_request",
        card_payload: { amountCents: 3000, currency: "MXN", paymentLinkCode: "open_code", state: "sent" },
        deleted_at: null,
      },
    ],
  });
  const result = await syncPaymentCardsForRecord(admin, { tenantId: TENANT, recordId: ORDER, paymentState: "paid" });
  assert.deepEqual(result, { ok: true, updated: 1 });
  const paid = store.inquiry_messages.find((m) => (m as { id: string }).id === "m-paid") as CardRow;
  const open = store.inquiry_messages.find((m) => (m as { id: string }).id === "m-open") as CardRow;
  assert.equal(paid.card_payload?.state, "paid");
  assert.equal(open.card_payload?.state, "sent");
});

test("cardsMatchingRequest leaves siblings alone when codes are known but none match", () => {
  const cards = [
    { id: "a", card_payload: { paymentLinkCode: "x", state: "sent" } },
    { id: "b", card_payload: { paymentLinkCode: "y", state: "sent" } },
  ];
  assert.deepEqual(cardsMatchingRequest(cards, new Set(["z"])), []);
});

test("a booking deposit stamps the sale total and the method that settled", async () => {
  const booking = uuid(4);
  const { admin, store } = fakeAdmin({
    conversation_records: [{ id: "cr-1", tenant_id: TENANT, inquiry_id: INQUIRY, record_kind: "appointment", record_id: booking, unlinked_at: null }],
    agency_bookings: [{ id: booking, total_client_revenue: 50, currency_code: "MXN" }],
    inquiry_messages: [
      {
        id: "m-1",
        tenant_id: TENANT,
        inquiry_id: INQUIRY,
        message_kind: "payment_request",
        card_payload: { amountCents: 2000, currency: "MXN", state: "sent" },
        deleted_at: null,
      },
    ],
  });
  const result = await syncPaymentCardsForRecord(admin, {
    tenantId: TENANT,
    recordId: booking,
    paymentState: "paid",
    method: "wire",
  });
  assert.equal(result.ok, true);
  const card = (store.inquiry_messages[0] as { card_payload: Record<string, unknown> }).card_payload;
  assert.equal(card.state, "paid");
  assert.equal(card.totalCents, 5000);
  assert.equal(card.paidCents, 2000);
  assert.equal(card.dueCents, 3000);
  assert.equal(card.currency, "MXN");
  assert.equal(card.method, "wire");
});

test("cash on an inquiry fills a paid card once and does not rewrite a refund", async () => {
  const { admin, store } = fakeAdmin({
    agency_bookings: [{ id: uuid(5), tenant_id: TENANT, source_inquiry_id: INQUIRY, total_client_revenue: 40, currency_code: "USD", created_at: "2026-09-24T00:00:00Z" }],
    inquiry_messages: [
      {
        id: "m-1",
        tenant_id: TENANT,
        inquiry_id: INQUIRY,
        message_kind: "payment_request",
        card_payload: { amountCents: 1500, state: "paid" },
        deleted_at: null,
      },
    ],
  });
  await stampInquiryPaidCards(admin, { tenantId: TENANT, inquiryId: INQUIRY, method: "cash", paidCents: 1500 });
  const card = (store.inquiry_messages[0] as { card_payload: Record<string, unknown> }).card_payload;
  assert.equal(card.method, "cash");
  assert.equal(card.dueCents, 2500);
  const before = JSON.stringify(card);
  await stampInquiryPaidCards(admin, { tenantId: TENANT, inquiryId: INQUIRY, method: "wire", paidCents: 1500 });
  assert.equal(JSON.stringify((store.inquiry_messages[0] as { card_payload: unknown }).card_payload), before);
});
