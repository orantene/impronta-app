import assert from "node:assert/strict";
import { test } from "node:test";

import { paidRecordDoesNotResolveThread, readConversationState, readOpportunityState, resolveDoesNotCancelRecords } from "./state";

test("unread is not a conversation state", () => {
  const state = readConversationState({
    conversationState: null,
    opportunityState: null,
    lastCustomerMessageAt: "2026-09-11T10:00:00Z",
    lastStaffMessageAt: "2026-09-11T09:00:00Z",
    resolvedAt: null,
    lostReason: null,
    status: "submitted",
    currentOfferId: null,
    unread: true,
  });
  assert.equal(state, "needs_reply");
});

test("resolved stays resolved even when a later indicator is unread", () => {
  const state = readConversationState({
    conversationState: "resolved",
    opportunityState: "won",
    lastCustomerMessageAt: "2026-09-11T12:00:00Z",
    lastStaffMessageAt: null,
    resolvedAt: "2026-09-11T11:00:00Z",
    lostReason: null,
    status: "booked",
    currentOfferId: "o1",
    unread: true,
  });
  assert.equal(state, "resolved");
});

test("lost opportunity does not resolve the thread", () => {
  const conversation = readConversationState({
    conversationState: "awaiting_customer",
    opportunityState: "lost",
    lastCustomerMessageAt: null,
    lastStaffMessageAt: "2026-09-11T10:00:00Z",
    resolvedAt: null,
    lostReason: "no budget",
    status: "rejected",
    currentOfferId: null,
    unread: false,
  });
  assert.equal(conversation, "awaiting_customer");
  assert.equal(
    readOpportunityState({
      conversationState: "awaiting_customer",
      opportunityState: null,
      lastCustomerMessageAt: null,
      lastStaffMessageAt: null,
      resolvedAt: null,
      lostReason: "no budget",
      status: "rejected",
      currentOfferId: null,
      unread: false,
    }),
    "lost",
  );
  assert.equal(resolveDoesNotCancelRecords(), true);
  assert.equal(paidRecordDoesNotResolveThread(), true);
});
