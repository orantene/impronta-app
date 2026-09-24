import assert from "node:assert/strict";
import { test } from "node:test";

import { fakeAdmin, uuid } from "@/lib/storefront/__fixtures__/fake-admin";

import { postVerifiedCollectionCards } from "./post-payment-cards";

const TENANT = uuid(1);
const INQUIRY = uuid(2);
const ORDER_A = uuid(3);
const ORDER_B = uuid(4);

test("two orders in one thread each get a confirmation, and a line without a price has no zero amount", async () => {
  const lineA = uuid(5);
  const linePriced = uuid(9);
  const { admin, store } = fakeAdmin({
    conversation_records: [
      { id: "cr-a", tenant_id: TENANT, inquiry_id: INQUIRY, record_id: ORDER_A, unlinked_at: null },
      { id: "cr-b", tenant_id: TENANT, inquiry_id: INQUIRY, record_id: ORDER_B, unlinked_at: null },
    ],
    orders: [
      { id: ORDER_A, total_cents: 4000, currency: "USD" },
      { id: ORDER_B, total_cents: 1500, currency: "USD" },
    ],
    order_lines: [
      { id: lineA, order_id: ORDER_A, label: "Door" },
      { id: linePriced, order_id: ORDER_A, label: "Seat", unit_cents: 800 },
    ],
    admissions: [
      { id: uuid(7), tenant_id: TENANT, order_line_id: lineA, status: "valid" },
      { id: uuid(8), tenant_id: TENANT, order_line_id: linePriced, status: "valid" },
    ],
    inquiry_messages: [],
  });

  await postVerifiedCollectionCards(admin, { tenantId: TENANT, orderId: ORDER_A });
  await postVerifiedCollectionCards(admin, { tenantId: TENANT, orderId: ORDER_A });
  await postVerifiedCollectionCards(admin, { tenantId: TENANT, orderId: ORDER_B });

  const messages = store.inquiry_messages as Array<{ message_kind: string; card_payload: Record<string, unknown> }>;
  const confirmations = messages.filter((m) => m.message_kind === "order_confirmation");
  assert.equal(confirmations.length, 2);
  assert.deepEqual(confirmations.map((m) => m.card_payload.orderId).sort(), [ORDER_A, ORDER_B].sort());

  const tickets = messages.filter((m) => m.message_kind === "tickets_card");
  assert.equal(tickets.length, 1);
  const tiers = (tickets[0]?.card_payload.tiers ?? []) as Array<Record<string, unknown>>;
  const bare = tiers.find((t) => t.id === lineA);
  const priced = tiers.find((t) => t.id === linePriced);
  assert.equal(bare && "priceCents" in bare, false);
  assert.equal(priced?.priceCents, 800);
  assert.equal(JSON.stringify(messages).includes("ticketCode"), false);
});
