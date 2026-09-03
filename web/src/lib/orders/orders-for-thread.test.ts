import { test } from "node:test";
import assert from "node:assert/strict";
import { orderIdsFromMessages } from "@/lib/orders/orders-for-thread";

test("collects order ids from order cards only", () => {
  const ids = orderIdsFromMessages([
    { message_kind: "text", card_payload: null },
    { message_kind: "order", card_payload: { order_id: "o1" } },
    { message_kind: "offer_event", card_payload: { order_id: "not_mine" } },
    { message_kind: "order", card_payload: { order_id: "o2" } },
  ]);
  assert.deepEqual(ids, ["o1", "o2"]);
});

test("de-duplicates — a thread may card the same order more than once", () => {
  const ids = orderIdsFromMessages([
    { message_kind: "order", card_payload: { order_id: "o1" } },
    { message_kind: "order", card_payload: { order_id: "o1" } },
  ]);
  assert.deepEqual(ids, ["o1"]);
});

test("survives malformed payloads rather than throwing in a thread render", () => {
  const ids = orderIdsFromMessages([
    { message_kind: "order", card_payload: null },
    { message_kind: "order", card_payload: {} },
    { message_kind: "order", card_payload: { order_id: "" } },
    { message_kind: "order", card_payload: { order_id: 42 as unknown as string } },
    { message_kind: "order" },
    { message_kind: "order", card_payload: { order_id: "good" } },
  ]);
  // One bad card must not blank a whole conversation.
  assert.deepEqual(ids, ["good"]);
});
