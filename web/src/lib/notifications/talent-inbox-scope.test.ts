import assert from "node:assert/strict";
import { test } from "node:test";

import { filterQaFixtureInboxRows } from "@/lib/messages-v5/qa-fixture-row";

import { scopeTalentNotificationsToInbox, unreadConversationNotificationCount } from "./talent-inbox-scope";

const n = (id: string, kind: "message" | "offer" | "system", inq: string | null, read = false) => ({
  id,
  kind,
  originInquiryId: inq,
  read,
});

// One fixture set, read through both surfaces.
const inboxRows = [
  { id: "a", contactName: "Sofia", contactEmail: "s@gmail.com", subject: "Hi", lastMessagePreview: "Hola", unread: true },
  { id: "q", contactName: "QA Guest", contactEmail: "qa@impronta.test", subject: "x", lastMessagePreview: "y", unread: true },
];
const visible = new Set(filterQaFixtureInboxRows(inboxRows).rows.map((r) => r.id));
const notifs = [
  n("1", "message", "a"),
  n("2", "message", "q"), // QA thread the inbox hides
  n("3", "offer", "gone"), // thread outside her scope
  n("4", "offer", null), // offer with no thread
  n("5", "system", null), // theme update, kept
  n("6", "message", "a", true),
];

test("bell unread equals inbox unread for the same fixtures", () => {
  const inboxUnread = filterQaFixtureInboxRows(inboxRows).unreadCount;
  assert.equal(inboxUnread, 1);
  assert.equal(unreadConversationNotificationCount(notifs.filter((x) => x.kind !== "system"), visible), inboxUnread);
});

test("orphan conversation notifications are dropped, system rows kept", () => {
  assert.deepEqual(scopeTalentNotificationsToInbox(notifs, visible).map((x) => x.id), ["1", "5", "6"]);
});

test("unknown visibility hides nothing", () => {
  assert.equal(scopeTalentNotificationsToInbox(notifs, null).length, notifs.length);
});
