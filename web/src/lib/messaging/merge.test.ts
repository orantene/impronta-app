import assert from "node:assert/strict";
import { test } from "node:test";

import { fakeAdmin, uuid } from "@/lib/storefront/__fixtures__/fake-admin";

import { mergeInquiries } from "./merge";

const TENANT = uuid(1);
const DUP = uuid(2);
const INTO = uuid(3);
const ACTOR = uuid(4);
const OTHER_TENANT = uuid(9);

function seed(
  overrides: Partial<{
    dupVersion: number;
    conversationRecords: Array<Record<string, unknown>>;
    orders: Array<Record<string, unknown>>;
    offers: Array<Record<string, unknown>>;
    dupTenant: string;
    intoTenant: string;
  }> = {},
) {
  return fakeAdmin({
    inquiries: [
      { id: DUP, tenant_id: overrides.dupTenant ?? TENANT, version: overrides.dupVersion ?? 1 },
      { id: INTO, tenant_id: overrides.intoTenant ?? TENANT, version: 1 },
    ],
    inquiry_messages: [
      { id: uuid(101), inquiry_id: DUP, body: "hi" },
      { id: uuid(102), inquiry_id: DUP, body: "there" },
      { id: uuid(103), inquiry_id: INTO, body: "already here" },
    ],
    inquiry_attachments: [{ id: uuid(201), inquiry_id: DUP, filename: "brief.pdf" }],
    inquiry_message_reads: [
      { inquiry_id: DUP, thread_type: "group", user_id: ACTOR, last_read_at: "2026-09-10T10:00:00Z", last_read_message_id: null },
    ],
    conversation_records: overrides.conversationRecords ?? [],
    orders: overrides.orders ?? [],
    inquiry_offers: overrides.offers ?? [],
    inquiry_action_log: [],
  });
}

test("moves messages and attachments, resolves the duplicate as merged, logs both sides", async () => {
  const { admin, store } = seed();
  const result = await mergeInquiries(admin, {
    tenantId: TENANT,
    duplicateInquiryId: DUP,
    intoInquiryId: INTO,
    expectedVersion: 1,
    actorUserId: ACTOR,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.mergedInto, INTO);

  const messages = store.inquiry_messages as Array<{ inquiry_id: string }>;
  assert.equal(messages.filter((m) => m.inquiry_id === DUP).length, 0);
  assert.equal(messages.filter((m) => m.inquiry_id === INTO).length, 3);

  const attachments = store.inquiry_attachments as Array<{ inquiry_id: string }>;
  assert.equal(attachments.every((a) => a.inquiry_id === INTO), true);

  const dupRow = (store.inquiries as Array<Record<string, unknown>>).find((r) => r.id === DUP)!;
  assert.equal(dupRow.conversation_state, "resolved");
  assert.equal(dupRow.lost_reason, "merged");
  assert.equal(dupRow.version, 2);

  const logs = store.inquiry_action_log as Array<Record<string, unknown>>;
  const successLogs = logs.filter((l) => l.result === "success");
  assert.equal(successLogs.length, 2);
  assert.ok(successLogs.some((l) => l.inquiry_id === DUP && (l.metadata as Record<string, unknown>).direction === "moved_into"));
  assert.ok(successLogs.some((l) => l.inquiry_id === INTO && (l.metadata as Record<string, unknown>).direction === "moved_from"));

  // No row was ever deleted from inquiry_messages / inquiry_attachments.
  assert.equal(messages.length, 3);
  assert.equal(attachments.length, 1);
});

test("never deletes rows: inquiry_message_reads is moved (upserted), not just copied", async () => {
  const { admin, store } = seed();
  await mergeInquiries(admin, {
    tenantId: TENANT,
    duplicateInquiryId: DUP,
    intoInquiryId: INTO,
    expectedVersion: 1,
    actorUserId: ACTOR,
  });
  const reads = store.inquiry_message_reads as Array<Record<string, unknown>>;
  assert.equal(reads.filter((r) => r.inquiry_id === DUP).length, 0);
  assert.equal(reads.filter((r) => r.inquiry_id === INTO).length, 1);
});

test("refuses same-inquiry merge", async () => {
  const { admin } = seed();
  const result = await mergeInquiries(admin, {
    tenantId: TENANT,
    duplicateInquiryId: DUP,
    intoInquiryId: DUP,
    expectedVersion: 1,
    actorUserId: ACTOR,
  });
  assert.deepEqual(result, { ok: false, reason: "invalid" });
});

test("refuses cross-tenant merge", async () => {
  const { admin } = seed({ intoTenant: OTHER_TENANT });
  const result = await mergeInquiries(admin, {
    tenantId: TENANT,
    duplicateInquiryId: DUP,
    intoInquiryId: INTO,
    expectedVersion: 1,
    actorUserId: ACTOR,
  });
  assert.deepEqual(result, { ok: false, reason: "wrong_tenant" });
});

test("refuses when the duplicate has a paid order, and logs the failure with a reason", async () => {
  const { admin, store } = seed({
    conversationRecords: [{ tenant_id: TENANT, inquiry_id: DUP, record_kind: "order", record_id: uuid(301), unlinked_at: null }],
    orders: [{ id: uuid(301), status: "paid" }],
  });
  const result = await mergeInquiries(admin, {
    tenantId: TENANT,
    duplicateInquiryId: DUP,
    intoInquiryId: INTO,
    expectedVersion: 1,
    actorUserId: ACTOR,
  });
  assert.deepEqual(result, { ok: false, reason: "not_allowed" });
  const logs = store.inquiry_action_log as Array<Record<string, unknown>>;
  assert.equal(logs.length, 1);
  assert.equal(logs[0].result, "failure");
  assert.equal(logs[0].reason, "paid_or_confirmed_record");
  // Nothing moved.
  const messages = store.inquiry_messages as Array<{ inquiry_id: string }>;
  assert.equal(messages.filter((m) => m.inquiry_id === DUP).length, 2);
});

test("refuses when the target has an accepted offer", async () => {
  const { admin } = seed({
    conversationRecords: [{ tenant_id: TENANT, inquiry_id: INTO, record_kind: "offer", record_id: uuid(302), unlinked_at: null }],
    offers: [{ id: uuid(302), status: "accepted" }],
  });
  const result = await mergeInquiries(admin, {
    tenantId: TENANT,
    duplicateInquiryId: DUP,
    intoInquiryId: INTO,
    expectedVersion: 1,
    actorUserId: ACTOR,
  });
  assert.deepEqual(result, { ok: false, reason: "not_allowed" });
});

test("a draft order (not paid) does not block the merge", async () => {
  const { admin } = seed({
    conversationRecords: [{ tenant_id: TENANT, inquiry_id: DUP, record_kind: "order", record_id: uuid(303), unlinked_at: null }],
    orders: [{ id: uuid(303), status: "draft" }],
  });
  const result = await mergeInquiries(admin, {
    tenantId: TENANT,
    duplicateInquiryId: DUP,
    intoInquiryId: INTO,
    expectedVersion: 1,
    actorUserId: ACTOR,
  });
  assert.equal(result.ok, true);
});

test("stale expectedVersion is a conflict, not a write (race guard)", async () => {
  const { admin, store } = seed({ dupVersion: 5 });
  const result = await mergeInquiries(admin, {
    tenantId: TENANT,
    duplicateInquiryId: DUP,
    intoInquiryId: INTO,
    expectedVersion: 1,
    actorUserId: ACTOR,
  });
  assert.deepEqual(result, { ok: false, reason: "conflict" });
  const messages = store.inquiry_messages as Array<{ inquiry_id: string }>;
  assert.equal(messages.filter((m) => m.inquiry_id === DUP).length, 2);
});

test("two merges of the same duplicate: the second loses the version lock and is a conflict, not a double move", async () => {
  const { admin, store } = seed();
  const first = await mergeInquiries(admin, {
    tenantId: TENANT,
    duplicateInquiryId: DUP,
    intoInquiryId: INTO,
    expectedVersion: 1,
    actorUserId: ACTOR,
  });
  const second = await mergeInquiries(admin, {
    tenantId: TENANT,
    duplicateInquiryId: DUP,
    intoInquiryId: INTO,
    expectedVersion: 1,
    actorUserId: ACTOR,
  });
  assert.equal(first.ok, true);
  assert.deepEqual(second, { ok: false, reason: "conflict" });
  const messages = store.inquiry_messages as Array<{ inquiry_id: string }>;
  // Exactly one move happened — target has the original 3 rows, not 5.
  assert.equal(messages.filter((m) => m.inquiry_id === INTO).length, 3);
});
