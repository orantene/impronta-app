import assert from "node:assert/strict";
import { test } from "node:test";

import { fakeAdmin, uuid } from "@/lib/storefront/__fixtures__/fake-admin";

import { loadConversationHistory } from "./history";

const TENANT = uuid(1);
const INQUIRY = uuid(2);
const STAFF = uuid(3);

function seed(rows: { actionLog?: Array<Record<string, unknown>>; events?: Array<Record<string, unknown>> } = {}) {
  return fakeAdmin({
    inquiries: [{ id: INQUIRY, tenant_id: TENANT }],
    inquiry_action_log: (rows.actionLog ?? []).map((r) => ({ result: "success", metadata: null, ...r })),
    inquiry_events: rows.events ?? [],
    profiles: [{ id: STAFF, display_name: "Ana" }],
  });
}

test("renders a rename entry with the old/new EN sentence", async () => {
  const { admin } = seed({
    actionLog: [
      {
        inquiry_id: INQUIRY,
        actor_user_id: STAFF,
        action_type: "messaging_rename",
        created_at: "2026-09-10T10:00:00Z",
        metadata: { old: "Marco Ruiz", new: "Dinner for 6" },
      },
    ],
  });
  const result = await loadConversationHistory(admin, { tenantId: TENANT, inquiryId: INQUIRY });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.entries, [
    { at: "2026-09-10T10:00:00Z", actorLabel: "Ana", kind: "rename", text: 'Ana renamed this conversation to "Dinner for 6"' },
  ]);
});

test("distinguishes assignment from handover via metadata.handover", async () => {
  const { admin } = seed({
    actionLog: [
      {
        inquiry_id: INQUIRY,
        actor_user_id: STAFF,
        action_type: "messaging_assign_owner",
        created_at: "2026-09-10T10:00:00Z",
        metadata: { ownerUserId: STAFF, ownerLabel: "Ana", handover: false },
      },
      {
        inquiry_id: INQUIRY,
        actor_user_id: STAFF,
        action_type: "messaging_assign_owner",
        created_at: "2026-09-10T11:00:00Z",
        metadata: { ownerUserId: STAFF, ownerLabel: "Luis", handover: true },
      },
    ],
  });
  const result = await loadConversationHistory(admin, { tenantId: TENANT, inquiryId: INQUIRY });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.entries[0].kind, "assignment");
  assert.equal(result.entries[1].kind, "handover");
});

test("distinguishes resolve from reopen via metadata.state, and drops the third (unknown) state", async () => {
  const { admin } = seed({
    actionLog: [
      {
        inquiry_id: INQUIRY,
        actor_user_id: STAFF,
        action_type: "messaging_set_conversation_state",
        created_at: "2026-09-10T10:00:00Z",
        metadata: { state: "resolved" },
      },
      {
        inquiry_id: INQUIRY,
        actor_user_id: STAFF,
        action_type: "messaging_set_conversation_state",
        created_at: "2026-09-10T11:00:00Z",
        metadata: { state: "needs_reply" },
      },
      {
        inquiry_id: INQUIRY,
        actor_user_id: STAFF,
        action_type: "messaging_set_conversation_state",
        created_at: "2026-09-10T12:00:00Z",
        metadata: { state: "awaiting_customer" },
      },
    ],
  });
  const result = await loadConversationHistory(admin, { tenantId: TENANT, inquiryId: INQUIRY });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.entries.map((e) => e.kind),
    ["resolve", "reopen"],
  );
});

test("renders offer/payment/booking events from inquiry_events, oldest first", async () => {
  const { admin } = seed({
    events: [
      { inquiry_id: INQUIRY, actor_user_id: null, actor_role: "client", event_type: "offer.accepted", created_at: "2026-09-10T12:00:00Z", payload: {} },
      { inquiry_id: INQUIRY, actor_user_id: STAFF, actor_role: "admin", event_type: "offer.sent", created_at: "2026-09-10T10:00:00Z", payload: {} },
      { inquiry_id: INQUIRY, actor_user_id: null, actor_role: "system", event_type: "payment.received", created_at: "2026-09-10T13:00:00Z", payload: {} },
    ],
  });
  const result = await loadConversationHistory(admin, { tenantId: TENANT, inquiryId: INQUIRY });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.entries.map((e) => e.kind),
    ["offer_sent", "offer_accepted", "payment_paid"],
  );
  assert.equal(result.entries[0].actorLabel, "Ana");
  assert.equal(result.entries[1].actorLabel, "Client");
});

test("an unrelated action_type or event_type is skipped, never thrown", async () => {
  const { admin } = seed({
    actionLog: [{ inquiry_id: INQUIRY, actor_user_id: STAFF, action_type: "some_future_action", created_at: "2026-09-10T10:00:00Z" }],
    events: [{ inquiry_id: INQUIRY, actor_user_id: null, actor_role: "system", event_type: "inquiry.created", created_at: "2026-09-10T09:00:00Z", payload: {} }],
  });
  const result = await loadConversationHistory(admin, { tenantId: TENANT, inquiryId: INQUIRY });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.entries, []);
});

test("refuses a conversation from another tenant", async () => {
  const { admin } = seed();
  const result = await loadConversationHistory(admin, { tenantId: uuid(9), inquiryId: INQUIRY });
  assert.deepEqual(result, { ok: false, reason: "wrong_tenant" });
});

test("refuses an inquiry that does not exist", async () => {
  const { admin } = seed();
  const result = await loadConversationHistory(admin, { tenantId: TENANT, inquiryId: uuid(404) });
  assert.deepEqual(result, { ok: false, reason: "not_found" });
});
