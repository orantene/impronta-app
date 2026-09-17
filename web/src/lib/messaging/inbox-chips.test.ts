/**
 * S2: record chips carry the state `messaging_sync_record_state` wrote to
 * `conversation_records` (payment_state / fulfilment_state / record_date),
 * in the inbox and in essentials alike. A row the writers never synced still
 * reads as nulls, so nothing downstream changes shape.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { fakeAdmin, uuid } from "@/lib/storefront/__fixtures__/fake-admin";

import { loadMessagingEssentials } from "./essentials";
import { loadMessagingInbox } from "./inbox";

const TENANT = uuid(1);
const INQUIRY = uuid(2);
const OTHER = uuid(3);
const ORDER = uuid(4);
const TICKETS = uuid(5);
const STALE = uuid(6);

function seed() {
  const inquiry = (id: string) => ({
    id,
    tenant_id: TENANT,
    location_slug: "default",
    contact_name: "Marco Ruiz",
    contact_phone: null,
    contact_email: null,
    conversation_state: "awaiting_customer",
    opportunity_state: null,
    channel: "web_chat",
    owner_user_id: null,
    last_customer_message_at: null,
    last_staff_message_at: "2026-09-17T10:00:00Z",
    resolved_at: null,
    lost_reason: null,
    status: "new",
    current_offer_id: null,
    message: "Hola",
    source_page: null,
    updated_at: "2026-09-17T10:00:00Z",
    version: 1,
  });
  return fakeAdmin({
    inquiries: [inquiry(INQUIRY), inquiry(OTHER)],
    inquiry_message_reads: [],
    inquiry_messages: [],
    inquiry_action_log: [],
    conversation_identity: [],
    profiles: [],
    conversation_records: [
      {
        tenant_id: TENANT,
        inquiry_id: INQUIRY,
        record_kind: "order",
        record_id: ORDER,
        payment_state: "paid",
        fulfilment_state: "ready",
        record_date: "2026-09-18T19:00:00Z",
        unlinked_at: null,
      },
      {
        tenant_id: TENANT,
        inquiry_id: INQUIRY,
        record_kind: "tickets",
        record_id: TICKETS,
        payment_state: null,
        fulfilment_state: null,
        record_date: null,
        unlinked_at: null,
      },
      {
        tenant_id: TENANT,
        inquiry_id: INQUIRY,
        record_kind: "order",
        record_id: STALE,
        payment_state: "paid",
        fulfilment_state: "fulfilled",
        record_date: null,
        unlinked_at: "2026-09-10T00:00:00Z",
      },
      {
        tenant_id: TENANT,
        inquiry_id: OTHER,
        record_kind: "appointment",
        record_id: uuid(7),
        payment_state: "requested",
        fulfilment_state: "confirmed",
        record_date: "2026-09-20T09:00:00Z",
        unlinked_at: null,
      },
    ],
  });
}

test("inbox chips read payment_state / fulfilment_state / record_date, live links only, per inquiry", async () => {
  const { admin } = seed();
  const result = await loadMessagingInbox(admin, {
    tenantId: TENANT,
    locationSlug: "default",
    filter: "all",
    actorUserId: uuid(9),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const row = result.rows.find((r) => r.id === INQUIRY);
  assert.ok(row);
  assert.deepEqual(
    row.recordChips.map((c) => [c.kind, c.recordId, c.paymentState, c.fulfilmentState, c.recordDate]),
    [
      ["order", ORDER, "paid", "ready", "2026-09-18T19:00:00Z"],
      ["tickets", TICKETS, null, null, null],
    ],
  );
  const other = result.rows.find((r) => r.id === OTHER);
  assert.ok(other);
  assert.equal(other.recordChips.length, 1);
  assert.equal(other.recordChips[0]?.paymentState, "requested");
  // A real payment state now drives the next action: something is owed.
  assert.equal(other.nextAction, "collect");
});

test("essentials.linked carries the same three fields", async () => {
  const { admin } = seed();
  const result = await loadMessagingEssentials(admin, { tenantId: TENANT, inquiryId: INQUIRY });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const order = result.essentials.linked.find((c) => c.recordId === ORDER);
  assert.deepEqual(order, {
    kind: "order",
    recordId: ORDER,
    label: "order",
    paymentState: "paid",
    fulfilmentState: "ready",
    recordDate: "2026-09-18T19:00:00Z",
  });
  assert.equal(result.essentials.linked.some((c) => c.recordId === STALE), false);
});
