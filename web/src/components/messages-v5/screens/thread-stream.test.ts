import assert from "node:assert/strict";
import { test } from "node:test";

import { CARD_KINDS, type ThreadMessage } from "@/lib/messaging/types";

import { BUBBLE_KINDS, buildStream, dayLabel, deliveryStateFor, isCardKindString, scrollTargetKey } from "./thread-stream";

function msg(id: string, at: string, over: Partial<ThreadMessage> = {}): ThreadMessage {
  return { id, inquiryId: "inq-1", kind: "text", body: `body ${id}`, payload: null, senderUserId: null, guestSessionId: "g-1", createdAt: at, editedAt: null, deletedAt: null, thread: "private", internal: false, delivery: null, ...over };
}

test("grouping: same sender within 3 minutes is first / middle / last; a gap or a sender change starts a new group", () => {
  const items = buildStream({
    messages: [msg("a", "2026-09-17T10:00:00Z"), msg("b", "2026-09-17T10:01:00Z"), msg("c", "2026-09-17T10:02:30Z"), msg("d", "2026-09-17T10:09:00Z"), msg("e", "2026-09-17T10:09:30Z", { senderUserId: "u-1", guestSessionId: null })],
    currentUserId: "u-1",
    unreadCount: 0,
  });
  const bubbles = items.filter((it) => it.kind === "message");
  assert.deepEqual(
    bubbles.map((b) => (b.kind === "message" ? [b.message.id, b.position, b.mine] : null)),
    [
      ["a", "first", false],
      ["b", "middle", false],
      ["c", "last", false],
      ["d", "single", false],
      ["e", "single", true],
    ],
  );
  assert.equal(items[0].kind, "day");
  assert.equal(items.filter((it) => it.kind === "day").length, 1);
});

test("day separators: one per calendar day, and a day break closes a group", () => {
  const items = buildStream({ messages: [msg("a", "2026-09-16T23:59:00Z"), msg("b", "2026-09-17T00:00:30Z")], currentUserId: null, unreadCount: 0 });
  // Two days in every timezone except the one where both fall on the same local date; the group must not join across a separator.
  const positions = items.filter((it) => it.kind === "message").map((it) => (it.kind === "message" ? it.position : ""));
  const days = items.filter((it) => it.kind === "day").length;
  if (days === 2) assert.deepEqual(positions, ["single", "single"]);
  else assert.deepEqual(positions, ["first", "last"]);
});

test("unread divider sits before the last N client messages and is the scroll target", () => {
  const items = buildStream({
    messages: [msg("a", "2026-09-17T10:00:00Z"), msg("s", "2026-09-17T10:05:00Z", { senderUserId: "u-1", guestSessionId: null }), msg("b", "2026-09-17T10:10:00Z"), msg("c", "2026-09-17T10:11:00Z")],
    currentUserId: "u-1",
    unreadCount: 2,
  });
  const keys = items.map((it) => it.key);
  const unreadAt = keys.indexOf("unread:b");
  assert.ok(unreadAt > 0, "divider before b");
  assert.equal(keys[unreadAt + 1], "b");
  assert.equal(scrollTargetKey(items), "unread:b");
  const none = buildStream({ messages: [msg("a", "2026-09-17T10:00:00Z")], currentUserId: null, unreadCount: 0 });
  assert.equal(scrollTargetKey(none), "a");
  assert.ok(!none.some((it) => it.kind === "unread"));
});

test("cards and system lines: every non-bubble CardKind is a card, unknown kinds are system lines, internal notes are mine", () => {
  for (const kind of CARD_KINDS) {
    if (BUBBLE_KINDS.has(kind)) continue;
    assert.ok(isCardKindString(kind), kind);
  }
  const items = buildStream({
    messages: [msg("card", "2026-09-17T10:00:00Z", { kind: "payment_request", payload: { amountCents: 100 } }), msg("sys", "2026-09-17T10:00:10Z", { kind: "system", body: "Ana took this conversation" }), msg("note", "2026-09-17T10:00:20Z", { kind: "internal_note", internal: true, senderUserId: "u-2", guestSessionId: null })],
    currentUserId: "u-1",
    unreadCount: 0,
  });
  assert.deepEqual(items.map((it) => it.kind), ["day", "card", "system", "message"]);
  const note = items[3];
  assert.ok(note.kind === "message" && note.mine && !note.fromClient);
});

test("delivery states map to the six bubble words; unknown is null", () => {
  assert.equal(deliveryStateFor({ channel: "whatsapp", state: "queued" }), "queued");
  assert.equal(deliveryStateFor({ channel: "whatsapp", state: "delivered" }), "delivered");
  assert.equal(deliveryStateFor({ channel: "sms", state: "weird" }), null);
  assert.equal(deliveryStateFor(null), null);
});

test("dayLabel says Today / Yesterday, else a short date", () => {
  const now = new Date("2026-09-17T12:00:00");
  const copy = { today: "Today", yesterday: "Yesterday" };
  assert.equal(dayLabel(new Date("2026-09-17T08:00:00"), copy, now), "Today");
  assert.equal(dayLabel(new Date("2026-09-16T23:00:00"), copy, now), "Yesterday");
  assert.match(dayLabel(new Date("2026-07-26T10:00:00"), copy, now), /Jul/);
});
