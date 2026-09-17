/** Shared fixtures for the kit render tests: one inbox row, one thread state, chips, a message, tasks. */

import type { CustomerMatch, DerivedTask, Essentials, InboxRow, InquiryMessagingState, RecordChip, ThreadMessage } from "@/lib/messaging/types";

export const NOW = new Date("2026-09-17T12:00:00Z");

export const CHIP_OFFER: RecordChip = { kind: "offer", recordId: "iq-512", label: "Offer v2 · $3,800", paymentState: null, fulfilmentState: null };
export const CHIP_ORDER: RecordChip = { kind: "order", recordId: "or-1203", label: "#1203 · $48.50", paymentState: "paid", fulfilmentState: "preparing", recordDate: "2026-09-17T19:40:00Z" };
export const CHIP_APPT: RecordChip = { kind: "appointment", recordId: "ap-2041", label: "AP-2041 · Sat 11:00", paymentState: "deposit_paid", fulfilmentState: "confirmed" };

export const STATE_NEEDS: InquiryMessagingState = { conversation: "needs_reply", opportunity: "awaiting_acceptance", records: [{ kind: "offer", recordId: "iq-512" }] };
export const STATE_WAIT: InquiryMessagingState = { conversation: "awaiting_customer", opportunity: "won", records: [{ kind: "order", recordId: "or-1203" }] };
export const STATE_RESOLVED: InquiryMessagingState = { conversation: "resolved", opportunity: "lost", records: [] };
export const STATE_BARE: InquiryMessagingState = { conversation: "needs_reply", opportunity: null, records: [] };

export function inboxRow(over: Partial<InboxRow> = {}): InboxRow {
  return {
    id: "inq-1",
    tenantId: "t-1",
    locationSlug: "impronta",
    contactName: "Valentina Ruiz",
    contactPhone: "+52 998 123 4411",
    contactEmail: "vale@ruiz.mx",
    conversationState: "needs_reply",
    opportunityState: "awaiting_acceptance",
    channel: "web_chat",
    ownerUserId: "u-sofia",
    ownerLabel: "Sofía H.",
    unread: true,
    unreadCount: 2,
    subject: "Beach wedding · Tulum · Aug 14",
    lastMessagePreview: "Can we add a second DJ set after dinner?",
    nextAction: "reply",
    lastCustomerMessageAt: "2026-09-17T11:58:00Z",
    lastStaffMessageAt: null,
    updatedAt: "2026-09-17T11:58:00Z",
    version: 4,
    recordChips: [CHIP_OFFER],
    ...over,
  };
}

export const ESSENTIALS: Essentials = {
  name: "Valentina Ruiz",
  version: 4,
  customer: { name: "Valentina Ruiz", email: "vale@ruiz.mx", phone: "+52 998 123 4411", identityLevel: "confirmed", identityMethod: "sms_code", request: null, source: "Website" },
  linked: [CHIP_OFFER],
  notes: [],
};

export const ESSENTIALS_VISITOR: Essentials = {
  name: "",
  version: 1,
  customer: { name: "", email: null, phone: null, identityLevel: "none", identityMethod: null, request: null, source: "Website · reservations page" },
  linked: [],
  notes: [],
};

export function message(over: Partial<ThreadMessage> = {}): ThreadMessage {
  return {
    id: "m-1",
    inquiryId: "inq-1",
    kind: "text",
    body: "This looks great. Can we add a second DJ set after dinner?",
    payload: null,
    senderUserId: null,
    guestSessionId: "g-1",
    createdAt: "2026-09-17T10:41:00Z",
    editedAt: null,
    deletedAt: null,
    thread: "private",
    internal: false,
    delivery: null,
    ...over,
  };
}

export const TASKS: DerivedTask[] = [
  { key: "reply", title: "Reply to the client", why: "The client is waiting on a reply.", primary: true },
  { key: "await_offer", title: "Follow up on the offer", why: "The offer was sent and is awaiting the client's acceptance.", primary: false },
  { key: "confirm_talent", title: "Confirm with talent", why: "1 talent confirmation pending.", primary: false },
];

export const MATCH: CustomerMatch = { customerId: "c-77", level: "phone", displayName: "Marco Salinas", email: null, phoneE164: "+529987710033", score: 0.9 };
