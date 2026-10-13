import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  SupportMessageRow,
  SupportTicketRow,
  SupportTicketSummary,
} from "@/lib/support/support-types";
import {
  EMPTY_THREAD,
  applyIncomingMessage,
  selectThread,
  threadReducer,
  unreadOpenCount,
  viewAfterOpenChange,
} from "./support-panel-state";

const ME = "user-me";

function msg(over: Partial<SupportMessageRow> & { id: string; ticketId: string }): SupportMessageRow {
  return {
    tenantId: null,
    authorKind: "agent",
    authorUserId: "staff",
    messageKind: "text",
    body: "hello",
    cardPayload: null,
    aiMeta: null,
    metadata: {},
    editedAt: null,
    deletedAt: null,
    createdAt: "2026-10-13T10:00:00.000Z",
    ...over,
  };
}

function ticketRow(id: string, over: Partial<SupportTicketRow> = {}): SupportTicketRow {
  return { id, status: "open", ...over } as SupportTicketRow;
}

function summary(id: string, over: Partial<SupportTicketSummary> = {}): SupportTicketSummary {
  return {
    id,
    ticketNumber: 1,
    subject: "s",
    status: "open",
    waitingOn: "support",
    category: null,
    lastMessageAt: "2026-10-13T09:00:00.000Z",
    lastMessagePreview: "",
    unread: false,
    requesterUserId: ME,
    surface: "talent",
    ...over,
  };
}

test("a new conversation shows nothing from the previous thread while it loads", () => {
  let st = threadReducer(EMPTY_THREAD, {
    type: "loaded",
    ticketId: "A",
    ticket: ticketRow("A"),
    messages: [msg({ id: "a1", ticketId: "A", body: "old thread" })],
  });
  assert.equal(selectThread(st, "A").messages.length, 1);
  const loadingB = selectThread(st, "B");
  assert.deepEqual(loadingB.messages, []);
  assert.equal(loadingB.ticket, null);
  assert.equal(loadingB.loading, true);
  st = threadReducer(st, { type: "loaded", ticketId: "B", ticket: ticketRow("B"), messages: [] });
  const b = selectThread(st, "B");
  assert.equal(b.loading, false);
  assert.deepEqual(b.messages, []);
});

test("realtime rows that beat the fetch are kept when the fetch lands", () => {
  let st = threadReducer(EMPTY_THREAD, { type: "message", row: msg({ id: "m2", ticketId: "B" }) });
  assert.equal(selectThread(st, "B").loading, true);
  st = threadReducer(st, {
    type: "loaded",
    ticketId: "B",
    ticket: ticketRow("B"),
    messages: [msg({ id: "m1", ticketId: "B" })],
  });
  assert.deepEqual(selectThread(st, "B").messages.map((m) => m.id), ["m1", "m2"]);
});

test("a duplicate realtime row is not added twice", () => {
  const row = msg({ id: "m1", ticketId: "A" });
  let st = threadReducer(EMPTY_THREAD, { type: "loaded", ticketId: "A", ticket: ticketRow("A"), messages: [row] });
  st = threadReducer(st, { type: "message", row });
  assert.equal(st.messages.length, 1);
});

test("a loaded thread with no ticket row stops loading instead of spinning forever", () => {
  const st = threadReducer(EMPTY_THREAD, { type: "loaded", ticketId: "A", ticket: null, messages: [] });
  assert.equal(selectThread(st, "A").loading, false);
});

test("no ticket selected is never loading", () => {
  assert.deepEqual(selectThread(EMPTY_THREAD, null), { ticket: null, messages: [], loading: false });
});

test("patchTicket only touches the ticket on screen", () => {
  const st = threadReducer(EMPTY_THREAD, { type: "loaded", ticketId: "A", ticket: ticketRow("A"), messages: [] });
  assert.equal(threadReducer(st, { type: "patchTicket", ticketId: "A", patch: { status: "resolved" } }).ticket?.status, "resolved");
  assert.equal(threadReducer(st, { type: "patchTicket", ticketId: "Z", patch: { status: "resolved" } }), st);
});

test("closing the panel returns to Home; closing on Home or opening changes nothing", () => {
  assert.equal(viewAfterOpenChange(true, false, "thread"), "home");
  assert.equal(viewAfterOpenChange(true, false, "tickets"), "home");
  assert.equal(viewAfterOpenChange(true, false, "home"), null);
  assert.equal(viewAfterOpenChange(false, true, "thread"), null);
  assert.equal(viewAfterOpenChange(false, false, "thread"), null);
});

test("badge counts open unread tickets only, and is the one shared number", () => {
  const list = [
    summary("1", { unread: true }),
    summary("2", { unread: true, status: "resolved" }),
    summary("3", { unread: false }),
    summary("4", { unread: true, status: "closed" }),
  ];
  assert.equal(unreadOpenCount(list), 1);
});

test("a support reply on another ticket marks it unread and raises the badge", () => {
  const list = [summary("1"), summary("2")];
  const next = applyIncomingMessage(list, msg({ id: "m", ticketId: "2", body: "We fixed it" }), { userId: ME, viewingTicketId: "1" });
  assert.equal(next[1]!.unread, true);
  assert.equal(next[1]!.lastMessagePreview, "We fixed it");
  assert.equal(next[0]!.unread, false);
  assert.equal(unreadOpenCount(next), 1);
});

test("a reply on the ticket being read does not raise the badge", () => {
  const next = applyIncomingMessage([summary("1")], msg({ id: "m", ticketId: "1" }), { userId: ME, viewingTicketId: "1" });
  assert.equal(next[0]!.unread, false);
});

test("the user's own message never marks a ticket unread", () => {
  const own = msg({ id: "m", ticketId: "1", authorKind: "requester", authorUserId: ME });
  assert.equal(applyIncomingMessage([summary("1")], own, { userId: ME, viewingTicketId: null })[0]!.unread, false);
});

test("internal notes and unknown tickets change nothing", () => {
  const list = [summary("1")];
  const note = applyIncomingMessage(list, msg({ id: "m", ticketId: "1", messageKind: "note" }), { userId: ME, viewingTicketId: null });
  assert.equal(note[0]!.unread, false);
  const stray = applyIncomingMessage(list, msg({ id: "m", ticketId: "zzz" }), { userId: ME, viewingTicketId: null });
  assert.deepEqual(stray, list);
});

test("an AI reply that realtime missed is merged in by the post-turn fetch (TUL-656)", () => {
  const mine = msg({ id: "u1", ticketId: "A", authorKind: "requester", authorUserId: ME });
  let st = threadReducer(EMPTY_THREAD, { type: "loaded", ticketId: "A", ticket: ticketRow("A"), messages: [mine] });
  const ai = msg({ id: "ai1", ticketId: "A", authorKind: "ai", authorUserId: null, createdAt: "2026-10-13T10:00:05.000Z" });
  st = threadReducer(st, { type: "merge", ticketId: "A", messages: [mine, ai] });
  assert.deepEqual(st.messages.map((m) => m.id), ["u1", "ai1"]);
  // A realtime echo of the same row afterwards does not duplicate it.
  st = threadReducer(st, { type: "message", row: ai });
  assert.equal(st.messages.length, 2);
});

test("a merge for another ticket never touches the thread on screen (TUL-656)", () => {
  const st = threadReducer(EMPTY_THREAD, { type: "loaded", ticketId: "B", ticket: ticketRow("B"), messages: [] });
  const next = threadReducer(st, { type: "merge", ticketId: "A", messages: [msg({ id: "x", ticketId: "A", authorKind: "ai" })] });
  assert.equal(next, st);
});
