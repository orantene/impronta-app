import assert from "node:assert/strict";
import { test } from "node:test";

import { EN_COPY } from "@/components/messages-v5/kit/test-copy";
import { NOW, inboxRow } from "@/components/messages-v5/kit/test-fixtures";

import {
  applyInboxFilters,
  groupInboxRows,
  hasExpiredHold,
  hasPaymentIssue,
  inboxSegmentCounts,
  isNeedsAction,
  matchesInboxSearch,
  rowsForSegment,
  searchInboxRows,
} from "./inbox-view";

/* ---------- isNeedsAction ---------- */

test("isNeedsAction: needs_reply is always needs action", () => {
  assert.equal(isNeedsAction(inboxRow({ conversationState: "needs_reply", ownerUserId: "u-1", nextAction: null }), NOW), true);
});

test("isNeedsAction: unassigned is needs action even when waiting on client", () => {
  const row = inboxRow({ conversationState: "awaiting_customer", ownerUserId: null, ownerLabel: null, nextAction: null });
  assert.equal(isNeedsAction(row, NOW), true);
});

test("isNeedsAction: nextAction follow_up is needs action", () => {
  const row = inboxRow({ conversationState: "awaiting_customer", ownerUserId: "u-1", nextAction: "follow_up" });
  assert.equal(isNeedsAction(row, NOW), true);
});

test("isNeedsAction: a payment chip in failed/unknown/expired is needs action", () => {
  for (const paymentState of ["failed", "unknown", "expired"]) {
    const row = inboxRow({
      conversationState: "awaiting_customer",
      ownerUserId: "u-1",
      nextAction: null,
      recordChips: [{ kind: "order", recordId: "or-1", label: "#1", paymentState, fulfilmentState: null }],
    });
    assert.equal(isNeedsAction(row, NOW), true, paymentState);
  }
});

test("isNeedsAction: paid/opened are not payment issues", () => {
  const row = inboxRow({
    conversationState: "awaiting_customer",
    ownerUserId: "u-1",
    nextAction: null,
    recordChips: [{ kind: "order", recordId: "or-1", label: "#1", paymentState: "paid", fulfilmentState: null }],
  });
  assert.equal(hasPaymentIssue(row), false);
  assert.equal(isNeedsAction(row, NOW), false);
});

test("hasExpiredHold: a hold whose recordDate is in the past is expired; future is not; no date can't be judged", () => {
  const past = inboxRow({ recordChips: [{ kind: "appointment", recordId: "a-1", label: "x", paymentState: null, fulfilmentState: "hold", recordDate: "2026-09-01T00:00:00Z" }] });
  const future = inboxRow({ recordChips: [{ kind: "appointment", recordId: "a-1", label: "x", paymentState: null, fulfilmentState: "hold", recordDate: "2026-12-01T00:00:00Z" }] });
  const noDate = inboxRow({ recordChips: [{ kind: "appointment", recordId: "a-1", label: "x", paymentState: null, fulfilmentState: "hold" }] });
  assert.equal(hasExpiredHold(past, NOW), true);
  assert.equal(hasExpiredHold(future, NOW), false);
  assert.equal(hasExpiredHold(noDate, NOW), false);
});

test("isNeedsAction: a resolved, assigned, answered, paid row is not needs action", () => {
  const row = inboxRow({
    conversationState: "resolved",
    ownerUserId: "u-1",
    nextAction: null,
    recordChips: [{ kind: "order", recordId: "or-1", label: "#1", paymentState: "paid", fulfilmentState: "fulfilled" }],
  });
  assert.equal(isNeedsAction(row, NOW), false);
});

/* ---------- segments ---------- */

test("rowsForSegment: needs/wait/all partition without double counting", () => {
  const needsRow = inboxRow({ id: "r-needs", conversationState: "needs_reply", ownerUserId: "u-1", nextAction: null });
  const waitRow = inboxRow({ id: "r-wait", conversationState: "awaiting_customer", ownerUserId: "u-1", nextAction: null });
  const unassignedButWaiting = inboxRow({ id: "r-unassigned-wait", conversationState: "awaiting_customer", ownerUserId: null, ownerLabel: null, nextAction: null });
  const resolvedRow = inboxRow({ id: "r-resolved", conversationState: "resolved", ownerUserId: "u-1", nextAction: null });
  const rows = [needsRow, waitRow, unassignedButWaiting, resolvedRow];

  assert.deepEqual(rowsForSegment(rows, "needs", NOW).map((r) => r.id), ["r-needs", "r-unassigned-wait"]);
  assert.deepEqual(rowsForSegment(rows, "wait", NOW).map((r) => r.id), ["r-wait"]);
  assert.deepEqual(rowsForSegment(rows, "all", NOW).map((r) => r.id), ["r-needs", "r-wait", "r-unassigned-wait", "r-resolved"]);
});

test("inboxSegmentCounts matches rowsForSegment lengths", () => {
  const rows = [
    inboxRow({ id: "a", conversationState: "needs_reply", ownerUserId: "u-1", nextAction: null }),
    inboxRow({ id: "b", conversationState: "awaiting_customer", ownerUserId: "u-1", nextAction: null }),
    inboxRow({ id: "c", conversationState: "resolved", ownerUserId: "u-1", nextAction: null }),
  ];
  assert.deepEqual(inboxSegmentCounts(rows, NOW), { needs: 1, wait: 1, all: 3 });
});

/* ---------- filters ---------- */

test("applyInboxFilters: no active filters is a no-op", () => {
  const rows = [inboxRow()];
  assert.deepEqual(applyInboxFilters(rows, []), rows);
});

test("applyInboxFilters: mine requires currentUserId to match", () => {
  const mine = inboxRow({ id: "m", ownerUserId: "u-sofia" });
  const other = inboxRow({ id: "o", ownerUserId: "u-other" });
  assert.deepEqual(applyInboxFilters([mine, other], ["mine"], { currentUserId: "u-sofia" }).map((r) => r.id), ["m"]);
  assert.deepEqual(applyInboxFilters([mine, other], ["mine"], {}).map((r) => r.id), []);
});

test("applyInboxFilters: chips narrow (AND), never widen back out", () => {
  const rows = [
    inboxRow({ id: "unread-mine", unread: true, unreadCount: 1, ownerUserId: "u-sofia" }),
    inboxRow({ id: "unread-other", unread: true, unreadCount: 1, ownerUserId: "u-other" }),
    inboxRow({ id: "read-mine", unread: false, unreadCount: 0, ownerUserId: "u-sofia" }),
  ];
  const unreadOnly = applyInboxFilters(rows, ["unread"], { currentUserId: "u-sofia" });
  assert.equal(unreadOnly.length, 2);
  const unreadAndMine = applyInboxFilters(rows, ["unread", "mine"], { currentUserId: "u-sofia" });
  assert.deepEqual(unreadAndMine.map((r) => r.id), ["unread-mine"]);
});

test("applyInboxFilters: record-kind chips (orders/offers/appointments/reservations/tickets)", () => {
  const order = inboxRow({ id: "order", recordChips: [{ kind: "order", recordId: "1", label: "x", paymentState: null, fulfilmentState: null }] });
  const offer = inboxRow({ id: "offer", recordChips: [{ kind: "offer", recordId: "2", label: "x", paymentState: null, fulfilmentState: null }] });
  assert.deepEqual(applyInboxFilters([order, offer], ["orders"]).map((r) => r.id), ["order"]);
  assert.deepEqual(applyInboxFilters([order, offer], ["offers"]).map((r) => r.id), ["offer"]);
});

test("applyInboxFilters: paymentIssues reuses hasPaymentIssue", () => {
  const bad = inboxRow({ id: "bad", recordChips: [{ kind: "order", recordId: "1", label: "x", paymentState: "expired", fulfilmentState: null }] });
  const ok = inboxRow({ id: "ok", recordChips: [{ kind: "order", recordId: "1", label: "x", paymentState: "paid", fulfilmentState: null }] });
  assert.deepEqual(applyInboxFilters([bad, ok], ["paymentIssues"]).map((r) => r.id), ["bad"]);
});

/* ---------- search ---------- */

test("searchInboxRows: matches name, subject or preview, case-insensitively", () => {
  const rows = [
    inboxRow({ id: "a", contactName: "Valentina Ruiz", subject: "Beach wedding", lastMessagePreview: "second DJ" }),
    inboxRow({ id: "b", contactName: "Marco Salinas", subject: "Corporate retreat", lastMessagePreview: "catering count" }),
  ];
  assert.deepEqual(searchInboxRows(rows, "valentina").map((r) => r.id), ["a"]);
  assert.deepEqual(searchInboxRows(rows, "RETREAT").map((r) => r.id), ["b"]);
  assert.deepEqual(searchInboxRows(rows, "catering count").map((r) => r.id), ["b"]);
  assert.deepEqual(searchInboxRows(rows, "").map((r) => r.id), ["a", "b"]);
  assert.deepEqual(searchInboxRows(rows, "nomatch"), []);
});

test("matchesInboxSearch: empty query always matches", () => {
  assert.equal(matchesInboxSearch(inboxRow(), "   "), true);
});

/* ---------- grouping ---------- */

test("groupInboxRows: needs action groups by reason in priority order, payment first", () => {
  const payment = inboxRow({ id: "p", conversationState: "needs_reply", ownerUserId: "u-1", nextAction: null, recordChips: [{ kind: "order", recordId: "1", label: "x", paymentState: "failed", fulfilmentState: null }] });
  const unassigned = inboxRow({ id: "u", conversationState: "awaiting_customer", ownerUserId: null, ownerLabel: null, nextAction: null });
  const reply = inboxRow({ id: "r", conversationState: "needs_reply", ownerUserId: "u-1", nextAction: null });
  const groups = groupInboxRows([reply, unassigned, payment], "needs", EN_COPY, NOW);
  assert.deepEqual(groups.map((g) => g.key), ["payment", "unassigned", "reply"]);
  assert.equal(groups[0]?.label, "Payment issue");
  assert.deepEqual(groups[0]?.rows.map((r) => r.id), ["p"]);
});

test("groupInboxRows: waiting groups by opportunity state, label from the state catalogue", () => {
  const sent = inboxRow({ id: "s", conversationState: "awaiting_customer", opportunityState: "offer_sent", ownerUserId: "u-1", nextAction: null });
  const gathering = inboxRow({ id: "g", conversationState: "awaiting_customer", opportunityState: "gathering", ownerUserId: "u-1", nextAction: null });
  const groups = groupInboxRows([sent, gathering], "wait", EN_COPY, NOW);
  assert.deepEqual(groups.map((g) => g.key), ["offer_sent", "gathering"]);
  assert.equal(groups[0]?.label, "Offer sent");
});

test("groupInboxRows: all groups by day, Today/Yesterday then weekday", () => {
  const today = inboxRow({ id: "t", lastCustomerMessageAt: "2026-09-17T09:00:00Z", updatedAt: "2026-09-17T09:00:00Z" });
  const yesterday = inboxRow({ id: "y", lastCustomerMessageAt: "2026-09-16T09:00:00Z", updatedAt: "2026-09-16T09:00:00Z" });
  const groups = groupInboxRows([today, yesterday], "all", EN_COPY, NOW, "en");
  assert.deepEqual(groups.map((g) => g.label), ["Today", "Yesterday"]);
});

test("groupInboxRows: omits empty groups", () => {
  const reply = inboxRow({ id: "r", conversationState: "needs_reply", ownerUserId: "u-1", nextAction: null });
  const groups = groupInboxRows([reply], "needs", EN_COPY, NOW);
  assert.deepEqual(groups.map((g) => g.key), ["reply"]);
});
