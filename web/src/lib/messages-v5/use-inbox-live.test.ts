import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyInboxRowPatch,
  patchFromInquiryUpdate,
  patchFromMessageInsert,
} from "./use-inbox-live";

type FakeRow = {
  id: string;
  lastMessagePreview: string;
  conversationState: "needs_reply" | "awaiting_customer" | "resolved";
  unreadCount: number;
  unread: boolean;
  updatedAt: string;
};

function row(overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    id: "inq-1",
    lastMessagePreview: "Hola, tienen mesa para 4?",
    conversationState: "awaiting_customer",
    unreadCount: 0,
    unread: false,
    updatedAt: "2026-09-17T10:00:00.000Z",
    ...overrides,
  };
}

// ── patchFromMessageInsert ───────────────────────────────────────────────

test("patchFromMessageInsert: a customer message (no sender_user_id) is incoming, unread +1", () => {
  const { patch, incoming } = patchFromMessageInsert({
    inquiry_id: "inq-1",
    body: "Can I move my booking to 8pm?",
    sender_user_id: null,
    created_at: "2026-09-17T11:00:00.000Z",
  });
  assert.equal(patch.inquiryId, "inq-1");
  assert.equal(patch.lastMessagePreview, "Can I move my booking to 8pm?");
  assert.equal(patch.unreadDelta, 1);
  assert.equal(patch.updatedAt, "2026-09-17T11:00:00.000Z");
  assert.deepEqual(incoming, { inquiryId: "inq-1", preview: "Can I move my booking to 8pm?" });
});

test("patchFromMessageInsert: a staff reply (sender_user_id set) carries no unread delta and no incoming event", () => {
  const { patch, incoming } = patchFromMessageInsert({
    inquiry_id: "inq-1",
    body: "Sure, moved to 8pm.",
    sender_user_id: "staff-9",
    created_at: "2026-09-17T11:05:00.000Z",
  });
  assert.equal(patch.unreadDelta, 0);
  assert.equal(incoming, null);
});

test("patchFromMessageInsert: preview is trimmed and truncated at 140 chars with an ellipsis", () => {
  const long = "x".repeat(200);
  const { patch } = patchFromMessageInsert({
    inquiry_id: "inq-1",
    body: `  ${long}  `,
    sender_user_id: null,
    created_at: "2026-09-17T11:00:00.000Z",
  });
  assert.equal(patch.lastMessagePreview!.length, 140);
  assert.ok(patch.lastMessagePreview!.endsWith("…"));
});

test("patchFromMessageInsert: null body previews as empty string, not 'null'", () => {
  const { patch } = patchFromMessageInsert({
    inquiry_id: "inq-1",
    body: null,
    sender_user_id: null,
    created_at: "2026-09-17T11:00:00.000Z",
  });
  assert.equal(patch.lastMessagePreview, "");
});

// ── patchFromInquiryUpdate ───────────────────────────────────────────────

test("patchFromInquiryUpdate: carries conversationState and updatedAt, no preview/unread fields", () => {
  const patch = patchFromInquiryUpdate({
    id: "inq-1",
    conversation_state: "resolved",
    updated_at: "2026-09-17T12:00:00.000Z",
  });
  assert.deepEqual(patch, {
    inquiryId: "inq-1",
    updatedAt: "2026-09-17T12:00:00.000Z",
    conversationState: "resolved",
  });
});

test("patchFromInquiryUpdate: an unrecognised conversation_state is dropped, not passed through", () => {
  const patch = patchFromInquiryUpdate({
    id: "inq-1",
    conversation_state: "some_future_state",
    updated_at: "2026-09-17T12:00:00.000Z",
  });
  assert.equal(patch.conversationState, undefined);
});

test("patchFromInquiryUpdate: a null conversation_state (never touched) is dropped, not coerced", () => {
  const patch = patchFromInquiryUpdate({ id: "inq-1", conversation_state: null, updated_at: "2026-09-17T12:00:00.000Z" });
  assert.equal(patch.conversationState, undefined);
});

// ── applyInboxRowPatch ───────────────────────────────────────────────────

test("applyInboxRowPatch: patches the matching row's preview, updatedAt and unread count", () => {
  const rows = [row({ id: "inq-1" }), row({ id: "inq-2" })];
  const next = applyInboxRowPatch(rows, {
    inquiryId: "inq-1",
    lastMessagePreview: "New message here",
    unreadDelta: 1,
    updatedAt: "2026-09-17T11:00:00.000Z",
  });
  assert.equal(next[0]!.lastMessagePreview, "New message here");
  assert.equal(next[0]!.unreadCount, 1);
  assert.equal(next[0]!.unread, true);
  assert.equal(next[0]!.updatedAt, "2026-09-17T11:00:00.000Z");
  // Untouched row is the SAME object (no needless re-render for the rest of the list).
  assert.equal(next[1], rows[1]);
});

test("applyInboxRowPatch: unreadDelta is additive across repeated patches", () => {
  let rows = [row({ id: "inq-1", unreadCount: 0 })];
  rows = applyInboxRowPatch(rows, { inquiryId: "inq-1", unreadDelta: 1, updatedAt: "t1" });
  rows = applyInboxRowPatch(rows, { inquiryId: "inq-1", unreadDelta: 1, updatedAt: "t2" });
  assert.equal(rows[0]!.unreadCount, 2);
});

test("applyInboxRowPatch: unreadDelta never drives the count below 0", () => {
  const rows = [row({ id: "inq-1", unreadCount: 0 })];
  const next = applyInboxRowPatch(rows, { inquiryId: "inq-1", unreadDelta: -5, updatedAt: "t1" });
  assert.equal(next[0]!.unreadCount, 0);
  assert.equal(next[0]!.unread, false);
});

test("applyInboxRowPatch: a state-only patch (inquiries UPDATE) leaves preview and unread alone", () => {
  const rows = [row({ id: "inq-1", lastMessagePreview: "original", unreadCount: 3, unread: true })];
  const next = applyInboxRowPatch(rows, {
    inquiryId: "inq-1",
    conversationState: "resolved",
    updatedAt: "2026-09-17T12:00:00.000Z",
  });
  assert.equal(next[0]!.lastMessagePreview, "original");
  assert.equal(next[0]!.unreadCount, 3);
  assert.equal(next[0]!.conversationState, "resolved");
});

test("applyInboxRowPatch: an inquiryId not in the list is a no-op (same array reference)", () => {
  const rows = [row({ id: "inq-1" })];
  const next = applyInboxRowPatch(rows, { inquiryId: "inq-unknown", updatedAt: "t1" });
  assert.equal(next, rows);
});
