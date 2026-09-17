import assert from "node:assert/strict";
import { test } from "node:test";

import { fakeAdmin, uuid } from "@/lib/storefront/__fixtures__/fake-admin";

import {
  messagingPreviewCancelRead,
  resolveMoneyRecordLines,
  isMoneyRecordKind,
  isCancelTargetAlready,
  stampOrderCancelStatus,
  releaseOrderLinesCapacity,
  cancelRecordReminder,
  refundArbitraryAmount,
  loadOwnedTransaction,
  orderLinkedToInquiry,
} from "./money";

const TENANT = uuid(1);
const ORDER = uuid(2);
const LINE_A = uuid(3);
const LINE_B = uuid(4);
const ADMISSION_A = uuid(5);
const ADMISSION_B = uuid(6);
const OFFERING = uuid(7);
const INQUIRY = uuid(8);

function seedOrder(overrides: Partial<{ orderStatus: string; linesRefunded: [number, number] }> = {}) {
  return fakeAdmin({
    orders: [
      { id: ORDER, tenant_id: TENANT, inquiry_id: INQUIRY, status: overrides.orderStatus ?? "paid", discount_cents: 0, tip_cents: 0, currency: "USD" },
    ],
    order_lines: [
      { id: LINE_A, order_id: ORDER, tenant_id: TENANT, total_cents: 5000, refunded_cents: overrides.linesRefunded?.[0] ?? 0, variant_id: null, offering_id: OFFERING, allocation_ids: ["alloc-a"] },
      { id: LINE_B, order_id: ORDER, tenant_id: TENANT, total_cents: 3000, refunded_cents: overrides.linesRefunded?.[1] ?? 0, variant_id: null, offering_id: null, allocation_ids: [] },
    ],
    admissions: [
      { id: ADMISSION_A, tenant_id: TENANT, order_line_id: LINE_A, starts_at: "2026-10-01T18:00:00Z", status: "valid" },
      { id: ADMISSION_B, tenant_id: TENANT, order_line_id: LINE_B, starts_at: "2026-10-05T18:00:00Z", status: "valid" },
    ],
    talent_offerings: [{ id: OFFERING, cancellation_hours: 24 }],
    booking_transactions: [
      { id: uuid(20), order_id: ORDER, status: "paid", gross_amount_cents: 8000, created_at: "2026-09-01T00:00:00Z", source_tenant_id: TENANT },
    ],
  });
}

test("isMoneyRecordKind: order/appointment/reservation/class_enrolment/tickets yes, project/offer no", () => {
  assert.equal(isMoneyRecordKind("order"), true);
  assert.equal(isMoneyRecordKind("appointment"), true);
  assert.equal(isMoneyRecordKind("reservation"), true);
  assert.equal(isMoneyRecordKind("class_enrolment"), true);
  assert.equal(isMoneyRecordKind("tickets"), true);
  assert.equal(isMoneyRecordKind("project"), false);
  assert.equal(isMoneyRecordKind("offer"), false);
});

test("resolveMoneyRecordLines: order kind resolves every line on the order", async () => {
  const { admin } = seedOrder();
  const resolved = await resolveMoneyRecordLines(admin, { tenantId: TENANT, recordKind: "order", recordId: ORDER });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(resolved.orderId, ORDER);
  assert.deepEqual(new Set(resolved.lineIds), new Set([LINE_A, LINE_B]));
});

test("resolveMoneyRecordLines: appointment kind resolves to its ONE order line, via the admission", async () => {
  const { admin } = seedOrder();
  const resolved = await resolveMoneyRecordLines(admin, { tenantId: TENANT, recordKind: "appointment", recordId: ADMISSION_A });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(resolved.orderId, ORDER);
  assert.deepEqual(resolved.lineIds, [LINE_A]);
});

test("resolveMoneyRecordLines: project/offer refuse invalid, not a lookup", async () => {
  const { admin } = seedOrder();
  const resolved = await resolveMoneyRecordLines(admin, { tenantId: TENANT, recordKind: "project", recordId: ORDER });
  assert.equal(resolved.ok, false);
  if (resolved.ok) return;
  assert.equal(resolved.reason, "invalid");
});

test("resolveMoneyRecordLines: an order in another tenant is not_found, never cross-tenant", async () => {
  const { admin } = seedOrder();
  const resolved = await resolveMoneyRecordLines(admin, { tenantId: uuid(999), recordKind: "order", recordId: ORDER });
  assert.equal(resolved.ok, false);
  if (resolved.ok) return;
  assert.equal(resolved.reason, "not_found");
});

test("messagingPreviewCancelRead: order preview sums refundable across lines and names the earliest window", async () => {
  const { admin } = seedOrder();
  const preview = await messagingPreviewCancelRead(admin, { tenantId: TENANT, recordKind: "order", recordId: ORDER });
  assert.equal(preview.ok, true);
  if (!preview.ok) return;
  assert.equal(preview.refundableCents, 8000); // capped by the one paid transaction
  assert.equal(preview.currency, "USD");
  assert.equal(preview.window.enforceable, true);
  assert.deepEqual(new Set(preview.freesAdmissionIds), new Set([ADMISSION_A, ADMISSION_B]));
});

test("messagingPreviewCancelRead: single-admission kind previews only that line", async () => {
  const { admin } = seedOrder();
  const preview = await messagingPreviewCancelRead(admin, { tenantId: TENANT, recordKind: "appointment", recordId: ADMISSION_A });
  assert.equal(preview.ok, true);
  if (!preview.ok) return;
  assert.equal(preview.refundableCents, 5000);
  assert.deepEqual(preview.freesAdmissionIds, [ADMISSION_A]);
});

test("messagingPreviewCancelRead: window is NOT enforceable when the offering has no cancellation_hours", async () => {
  const { admin } = seedOrder();
  const preview = await messagingPreviewCancelRead(admin, { tenantId: TENANT, recordKind: "appointment", recordId: ADMISSION_B });
  assert.equal(preview.ok, true);
  if (!preview.ok) return;
  assert.equal(preview.window.enforceable, false, "line B's offering_id is null, so there is no policy to read");
  assert.equal(preview.depositRefundable, true);
});

test("messagingPreviewCancelRead: feeCents is always null (no fee schedule exists anywhere in the codebase)", async () => {
  const { admin } = seedOrder();
  const preview = await messagingPreviewCancelRead(admin, { tenantId: TENANT, recordKind: "order", recordId: ORDER });
  assert.equal(preview.ok, true);
  if (!preview.ok) return;
  assert.equal(preview.feeCents, null);
});

test("isCancelTargetAlready: an order already cancelled/refunded is already; a live one is not", async () => {
  const live = seedOrder();
  assert.equal(await isCancelTargetAlready(live.admin, { tenantId: TENANT, recordKind: "order", recordId: ORDER, orderId: ORDER }), false);

  const done = seedOrder({ orderStatus: "refunded" });
  assert.equal(await isCancelTargetAlready(done.admin, { tenantId: TENANT, recordKind: "order", recordId: ORDER, orderId: ORDER }), true);
});

test("isCancelTargetAlready: a voided admission is already; a valid one is not", async () => {
  const { admin, store } = seedOrder();
  assert.equal(await isCancelTargetAlready(admin, { tenantId: TENANT, recordKind: "appointment", recordId: ADMISSION_A, orderId: ORDER }), false);
  (store.admissions as Array<Record<string, unknown>>).find((a) => a.id === ADMISSION_A)!.status = "void";
  assert.equal(await isCancelTargetAlready(admin, { tenantId: TENANT, recordKind: "appointment", recordId: ADMISSION_A, orderId: ORDER }), true);
});

test("stampOrderCancelStatus: writes the status, tenant-scoped", async () => {
  const { admin, store } = seedOrder();
  const ok = await stampOrderCancelStatus(admin, { tenantId: TENANT, orderId: ORDER, status: "cancelled" });
  assert.equal(ok, true);
  const row = (store.orders as Array<Record<string, unknown>>).find((o) => o.id === ORDER)!;
  assert.equal(row.status, "cancelled");
});

test("releaseOrderLinesCapacity: calls release_capacity with every line's allocation ids, flattened", async () => {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const { admin } = seedOrder();
  const rpcAdmin = admin as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown> };
  const originalRpc = rpcAdmin.rpc.bind(admin);
  rpcAdmin.rpc = async (fn, args) => {
    calls.push({ fn, args });
    return originalRpc(fn, args);
  };
  await releaseOrderLinesCapacity(admin, TENANT, [LINE_A, LINE_B]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.fn, "release_capacity");
  assert.deepEqual(calls[0]!.args, { p_allocation_ids: ["alloc-a"] });
});

test("releaseOrderLinesCapacity: no lines with allocations means no RPC call", async () => {
  const { admin } = seedOrder();
  const rpcAdmin = admin as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown> };
  let called = false;
  rpcAdmin.rpc = async () => {
    called = true;
    return { data: null, error: null };
  };
  await releaseOrderLinesCapacity(admin, TENANT, [LINE_B]); // LINE_B has no allocation_ids
  assert.equal(called, false);
});

test("cancelRecordReminder: cancels the one live scheduled reminder for that record, tenant-scoped", async () => {
  const REMINDER = uuid(30);
  const { admin, store } = fakeAdmin({
    scheduled_messages: [
      { id: REMINDER, tenant_id: TENANT, inquiry_id: INQUIRY, record_kind: "appointment", record_id: ADMISSION_A, state: "scheduled" },
      { id: uuid(31), tenant_id: TENANT, inquiry_id: INQUIRY, record_kind: "appointment", record_id: uuid(999), state: "scheduled" },
    ],
  });
  await cancelRecordReminder(admin, TENANT, "appointment", ADMISSION_A);
  const rows = store.scheduled_messages as Array<Record<string, unknown>>;
  assert.equal(rows.find((r) => r.id === REMINDER)!.state, "cancelled");
  assert.equal(rows.find((r) => r.id === uuid(31))!.state, "scheduled", "a different record's reminder is untouched");
});

test("refundArbitraryAmount: no paid transactions means nothing moves, ok, zero cents", async () => {
  const { admin } = fakeAdmin({ booking_transactions: [] });
  const result = await refundArbitraryAmount(admin, ORDER, 1000, "goodwill", uuid(50), "test");
  assert.deepEqual(result, { ok: true, movedCents: 0 });
});

test("refundArbitraryAmount: a provider refusal with nothing moved yet is ok:false, safe to retry", async () => {
  // Stripe is not configured in this test environment, so `executeBookingRefund`
  // refuses every attempt with `stripe_not_configured` before any money moves —
  // this exercises the exact branch that guards against blind retries.
  const { admin } = seedOrder();
  const result = await refundArbitraryAmount(admin, ORDER, 1000, "goodwill", uuid(50), "test");
  assert.equal(result.ok, false);
});

test("loadOwnedTransaction: resolves a transaction to its order only when source_tenant_id matches", async () => {
  const TXN = uuid(40);
  const { admin } = fakeAdmin({
    booking_transactions: [{ id: TXN, order_id: ORDER, source_tenant_id: TENANT }],
    orders: [{ id: ORDER, tenant_id: TENANT, inquiry_id: INQUIRY }],
  });
  const owned = await loadOwnedTransaction(admin, TENANT, TXN);
  assert.deepEqual(owned, { id: TXN, orderId: ORDER });
});

test("loadOwnedTransaction: a transaction whose source_tenant_id belongs to another tenant is refused", async () => {
  const TXN = uuid(41);
  const { admin } = fakeAdmin({
    booking_transactions: [{ id: TXN, order_id: ORDER, source_tenant_id: uuid(999) }],
    orders: [{ id: ORDER, tenant_id: TENANT, inquiry_id: INQUIRY }],
  });
  const owned = await loadOwnedTransaction(admin, TENANT, TXN);
  assert.equal(owned, null);
});

test("orderLinkedToInquiry: true via the direct orders.inquiry_id FK", async () => {
  const { admin } = fakeAdmin({
    orders: [{ id: ORDER, tenant_id: TENANT, inquiry_id: INQUIRY }],
    conversation_records: [],
  });
  assert.equal(await orderLinkedToInquiry(admin, TENANT, ORDER, INQUIRY), true);
});

test("orderLinkedToInquiry: true via a live conversation_records link when the direct FK disagrees", async () => {
  const OTHER_INQUIRY = uuid(70);
  const { admin } = fakeAdmin({
    orders: [{ id: ORDER, tenant_id: TENANT, inquiry_id: OTHER_INQUIRY }],
    conversation_records: [{ id: uuid(71), inquiry_id: INQUIRY, record_kind: "order", record_id: ORDER, unlinked_at: null }],
  });
  assert.equal(await orderLinkedToInquiry(admin, TENANT, ORDER, INQUIRY), true);
});

test("orderLinkedToInquiry: false when neither the FK nor a live link agrees", async () => {
  const { admin } = fakeAdmin({
    orders: [{ id: ORDER, tenant_id: TENANT, inquiry_id: uuid(70) }],
    conversation_records: [],
  });
  assert.equal(await orderLinkedToInquiry(admin, TENANT, ORDER, INQUIRY), false);
});

test("orderLinkedToInquiry: an UNLINKED conversation_records row does not count", async () => {
  const { admin } = fakeAdmin({
    orders: [{ id: ORDER, tenant_id: TENANT, inquiry_id: uuid(70) }],
    conversation_records: [{ id: uuid(72), inquiry_id: INQUIRY, record_kind: "order", record_id: ORDER, unlinked_at: "2026-09-01T00:00:00Z" }],
  });
  assert.equal(await orderLinkedToInquiry(admin, TENANT, ORDER, INQUIRY), false);
});
