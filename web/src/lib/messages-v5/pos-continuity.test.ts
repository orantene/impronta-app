import assert from "node:assert/strict";
import { test } from "node:test";

import type { InboxRow } from "@/lib/messaging/types";

import {
  appendContinuity,
  continuityParams,
  findConversationForOrder,
  findOpenConversationForCustomer,
  posMessagesDockHref,
  posSwitchHref,
  shouldDockBesideSale,
  workspaceMessagesHref,
  workspaceSwitchHref,
} from "./pos-continuity";

function row(partial: Partial<InboxRow>): InboxRow {
  return {
    id: "inq-1",
    tenantId: "t-1",
    locationSlug: "default",
    contactName: "Ana",
    contactPhone: null,
    contactEmail: null,
    conversationState: "needs_reply",
    opportunityState: null,
    channel: "sms",
    ownerUserId: null,
    ownerLabel: null,
    unread: false,
    unreadCount: 0,
    subject: "Ana",
    lastMessagePreview: "",
    nextAction: null,
    lastCustomerMessageAt: null,
    lastStaffMessageAt: null,
    updatedAt: "2026-09-17T00:00:00.000Z",
    version: 1,
    recordChips: [],
    ...partial,
  } as InboxRow;
}

test("continuityParams keeps only the params present", () => {
  assert.equal(continuityParams({ inquiryId: "i1", orderId: "o1" }).toString(), "inquiry=i1&order=o1");
  assert.equal(continuityParams({ inquiryId: "i1" }).toString(), "inquiry=i1");
  assert.equal(continuityParams({}).toString(), "");
});

test("appendContinuity respects an existing query string", () => {
  assert.equal(appendContinuity("/admin/pos?mode=counter", { orderId: "o1" }), "/admin/pos?mode=counter&order=o1");
  assert.equal(appendContinuity("/admin/messages", { inquiryId: "i1" }), "/admin/messages?inquiry=i1");
  assert.equal(appendContinuity("/admin/messages", {}), "/admin/messages");
});

test("posMessagesDockHref carries order and inquiry into the counter dock", () => {
  assert.equal(
    posMessagesDockHref({ posPath: "/w/acme/admin/pos", mode: "counter", orderId: "o1", inquiryId: "i1" }),
    "/w/acme/admin/pos?view=messages&mode=counter&inquiry=i1&order=o1",
  );
});

test("workspaceMessagesHref carries the inquiry, omits it when absent", () => {
  assert.equal(workspaceMessagesHref({ adminBasePath: "/w/acme/admin", inquiryId: "i1" }), "/w/acme/admin/messages?inquiry=i1");
  assert.equal(workspaceMessagesHref({ adminBasePath: "/w/acme/admin" }), "/w/acme/admin/messages");
});

test("posSwitchHref (workspace -> POS) and workspaceSwitchHref (POS -> workspace) round-trip the thread", () => {
  assert.equal(posSwitchHref({ adminBasePath: "/w/acme/admin", mode: "counter", inquiryId: "i1", orderId: "o1" }), "/w/acme/admin/pos?mode=counter&inquiry=i1&order=o1");
  assert.equal(workspaceSwitchHref({ adminBasePath: "/w/acme/admin", inquiryId: "i1" }), "/w/acme/admin/messages?inquiry=i1");
  assert.equal(workspaceSwitchHref({ adminBasePath: "/w/acme/admin" }), "/w/acme/admin");
});

test("shouldDockBesideSale is the 1100px owner-ruled breakpoint", () => {
  assert.equal(shouldDockBesideSale(1099), false);
  assert.equal(shouldDockBesideSale(1100), true);
  assert.equal(shouldDockBesideSale(1440), true);
});

test("findConversationForOrder reads the order chip already on the loaded rows", () => {
  const rows = [row({ id: "a", recordChips: [{ kind: "order", recordId: "o1", label: "", paymentState: null, fulfilmentState: null }] }), row({ id: "b" })];
  assert.equal(findConversationForOrder(rows, "o1"), "a");
  assert.equal(findConversationForOrder(rows, "o2"), null);
  assert.equal(findConversationForOrder(rows, null), null);
});

test("findOpenConversationForCustomer falls back to a contact match when the order has no chip yet", () => {
  const rows = [
    row({ id: "a", contactPhone: "+1 (555) 000-1111", conversationState: "resolved" }),
    row({ id: "b", contactEmail: "Ana@Example.com" }),
  ];
  assert.equal(findOpenConversationForCustomer(rows, { email: "ana@example.com" }), "b");
  // resolved rows are not "open"
  assert.equal(findOpenConversationForCustomer(rows, { phone: "5550001111" }), null);
  assert.equal(findOpenConversationForCustomer(rows, {}), null);
});
