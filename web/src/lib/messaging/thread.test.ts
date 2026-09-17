/**
 * D-MSG-2 on the POS thread reader: staff read both threads and each row
 * says which thread it belongs to; the customer view keeps the client thread
 * only and drops internal notes and deleted rows.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { customerVisibleMessages, loadMessagingThread } from "./thread";
import type { ThreadMessage } from "./types";

type Row = Record<string, unknown>;

/** A minimal chainable stand-in for the Supabase admin client. */
function fakeAdmin(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      const q = {
        select: () => q,
        eq: () => q,
        in: () => q,
        order: () => Promise.resolve({ data: rows, error: null }),
        maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
        then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
      };
      return q;
    },
  };
}

function row(over: Partial<Row>): Row {
  return {
    id: "m",
    inquiry_id: "inq",
    thread_type: "private",
    message_kind: "text",
    body: "hi",
    card_payload: null,
    sender_user_id: "staff-1",
    guest_session_id: null,
    created_at: "2026-09-17T00:00:00.000Z",
    edited_at: null,
    deleted_at: null,
    ...over,
  };
}

test("staff read both threads and every message carries its thread", async () => {
  const admin = fakeAdmin({
    inquiries: [{ id: "inq", tenant_id: "t1" }],
    inquiry_messages: [
      row({ id: "a", thread_type: "private" }),
      row({ id: "b", thread_type: "group" }),
      row({ id: "c", thread_type: "private", message_kind: "internal_note" }),
    ],
    message_delivery: [],
  });
  const result = await loadMessagingThread(admin, { tenantId: "t1", inquiryId: "inq" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.messages.map((m) => [m.id, m.thread, m.internal]),
    [
      ["a", "private", false],
      ["b", "group", false],
      ["c", "private", true],
    ],
  );
});

test("the customer sees the client thread only, minus internal notes and deleted rows", () => {
  const base: ThreadMessage = {
    id: "x",
    inquiryId: "inq",
    kind: "text",
    body: "hi",
    payload: null,
    senderUserId: "staff-1",
    guestSessionId: null,
    createdAt: "2026-09-17T00:00:00.000Z",
    editedAt: null,
    deletedAt: null,
    thread: "private",
    internal: false,
    delivery: null,
  };
  const visible = customerVisibleMessages([
    { ...base, id: "reply" },
    { ...base, id: "note", kind: "internal_note", internal: true },
    { ...base, id: "talent", thread: "group" },
    { ...base, id: "gone", deletedAt: "2026-09-17T01:00:00.000Z" },
  ]);
  assert.deepEqual(
    visible.map((m) => m.id),
    ["reply"],
  );
});
