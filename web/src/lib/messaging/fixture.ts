import type { Essentials, InboxRow, ThreadMessage } from "./types";

/** Fixture rows for board preview. Labelled mock, not qa-journeys. */
export const FIXTURE_TENANT = "33333333-3333-4333-8333-333333333333";

export function fixtureInbox(): InboxRow[] {
  return [
    row({
      id: "inq-visitor",
      contactName: "Visitor",
      subject: "Dinner tonight for 3",
      lastMessagePreview: "Do you do pizza for pickup around 7:30?",
      conversationState: "needs_reply",
      channel: "web_chat",
      ownerUserId: null,
      ownerLabel: null,
      unread: true,
      unreadCount: 1,
      nextAction: "assign",
      lastCustomerMessageAt: "2026-09-10T18:41:00Z",
    }),
    row({
      id: "inq-laura-m",
      contactName: "Laura Mendez",
      subject: "Colour + cut with Dani",
      lastMessagePreview: "You: Two times on Tuesday work for Dani",
      conversationState: "awaiting_customer",
      channel: "whatsapp",
      ownerUserId: "user-ana",
      ownerLabel: "Ana",
      unread: false,
      nextAction: "collect",
      recordChips: [{ kind: "appointment", recordId: "ap-2041", label: "AP-2041", paymentState: "unpaid", fulfilmentState: "hold" }],
      lastCustomerMessageAt: "2026-09-10T18:12:00Z",
    }),
    row({
      id: "inq-laura-o",
      contactName: "Laura Ortiz",
      subject: "Content for September",
      lastMessagePreview: "Offer v2 · $18,000 · sent 18:31",
      conversationState: "awaiting_customer",
      opportunityState: "offer_sent",
      channel: "email",
      ownerUserId: "user-ana",
      ownerLabel: "Ana",
      unread: false,
      nextAction: "follow_up",
      recordChips: [{ kind: "offer", recordId: "iq-512", label: "IQ-512", paymentState: null, fulfilmentState: "v2" }],
      lastCustomerMessageAt: "2026-09-10T18:31:00Z",
    }),
    row({
      id: "inq-alfa",
      contactName: "Grupo Alfa",
      subject: "Table for 6 · Sat 12 Sep",
      lastMessagePreview: "Can we add a cake and rooftop tickets?",
      conversationState: "needs_reply",
      channel: "email",
      ownerUserId: "user-luis",
      ownerLabel: "Luis",
      unread: true,
      unreadCount: 1,
      nextAction: "reply",
      recordChips: [{ kind: "reservation", recordId: "rs-509", label: "RS-509", paymentState: "paid", fulfilmentState: "confirmed" }],
      lastCustomerMessageAt: "2026-09-10T17:20:00Z",
    }),
    row({
      id: "inq-tomas",
      contactName: "Tomas Navarro",
      subject: "Rooftop Jazz · 4 tickets",
      lastMessagePreview: "Saturday after the concert",
      conversationState: "awaiting_customer",
      channel: "sms",
      ownerUserId: null,
      ownerLabel: null,
      unread: false,
      nextAction: "follow_up",
      recordChips: [{ kind: "tickets", recordId: "tk-1", label: "4 tickets", paymentState: "unpaid", fulfilmentState: null }],
      lastCustomerMessageAt: "2026-09-06T16:00:00Z",
    }),
  ];
}

export function fixtureThread(inquiryId: string): ThreadMessage[] {
  if (inquiryId === "inq-laura-m") {
    return [
      msg("m-l1", inquiryId, "Hi, I would like colour and a cut with Dani next week if she has anything Tuesday.", null, "2026-09-07T18:05:00Z"),
      msg("m-l2", inquiryId, "Two times on Tuesday work for Dani. Want to pick one?", "user-ana", "2026-09-10T18:10:00Z"),
    ];
  }
  return [
    msg("m1", inquiryId, "Hi! Do you do pizza for pickup around 7:30? We are 3 people.", null, "2026-09-10T18:41:00Z"),
    msg("m2", inquiryId, "Yes, pickup from 19:00 tonight. Two large pizzas feed 3 easily. Want to see the menu?", "user-ana", "2026-09-10T18:43:00Z"),
    msg("m3", inquiryId, "Yes please. I am Marco by the way, 998 if it is easier.", null, "2026-09-10T18:44:00Z"),
    {
      ...msg("m4", inquiryId, "", "user-ana", "2026-09-10T18:46:00Z"),
      kind: "menu_options",
      payload: {
        state: "viewed",
        labels: ["Margherita", "Diavola"],
        pricesCents: [18000, 21000],
        currency: "MXN",
        offeringIds: ["off-1", "off-2"],
      },
    },
    {
      ...msg("m5", inquiryId, "", "user-ana", "2026-09-10T18:52:00Z"),
      kind: "payment_request",
      payload: {
        state: "sent",
        paymentLinkCode: "pay-fixture",
        amountCents: 60000,
        currency: "MXN",
        amountKind: "full",
        expiresAt: "2026-09-10T19:15:00Z",
        reservationId: "res-1",
        summary: "Pay by 19:15 to keep 19:40",
      },
    },
  ];
}

export function fixtureEssentials(inquiryId: string): Essentials {
  if (inquiryId === "inq-laura-m") {
    return {
      customer: {
        name: "Laura Mendez",
        email: "laura@example.test",
        phone: "+52998",
        identityLevel: "confirmed",
        identityMethod: "phone",
        request: "Colour + cut with Dani",
        source: "booking",
      },
      linked: [{ kind: "appointment", recordId: "ap-2041", label: "AP-2041", paymentState: "unpaid", fulfilmentState: "hold" }],
      notes: [],
    };
  }
  return {
    customer: {
      name: inquiryId === "inq-visitor" ? "" : "Marco Ruiz",
      email: null,
      phone: inquiryId === "inq-visitor" ? null : "+52998",
      identityLevel: inquiryId === "inq-visitor" ? "none" : "linked",
      identityMethod: inquiryId === "inq-visitor" ? null : "name_only",
      request: "Pizza · pickup · 3 people",
      source: "casanube.mx/menu · Centro",
    },
    linked:
      inquiryId === "inq-visitor"
        ? []
        : [{ kind: "order", recordId: "ord-1203", label: "#1203", paymentState: "open", fulfilmentState: "basket" }],
    notes: [],
  };
}

export type MessagingSheetName =
  | "options"
  | "payment"
  | "lost"
  | "start"
  | "capture"
  | "match"
  | "assign"
  | "link"
  | "offer"
  | "follow"
  | "change"
  | "diff"
  | "recover"
  | "note"
  | "delivery"
  | "resolve"
  | "search"
  | "reminder"
  | "agency"
  | "actions";

export type MessagingPreview = {
  board: string;
  rows: InboxRow[];
  activeId: string | null;
  messages: ThreadMessage[];
  essentials: Essentials | null;
  loadState: "ok" | "empty" | "failed" | "no_results";
  focused: boolean;
  sheet: MessagingSheetName | null;
  toast: boolean;
  search: string;
  compact: boolean;
  portrait: boolean;
  customerView: boolean;
  checkoutStatus: "open" | "paid" | "expired" | "cancelled" | "unknown" | "declined" | "processing" | null;
};

function row(partial: Partial<InboxRow> & Pick<InboxRow, "id" | "contactName" | "subject" | "lastMessagePreview">): InboxRow {
  return {
    tenantId: FIXTURE_TENANT,
    locationSlug: "default",
    contactPhone: null,
    contactEmail: null,
    conversationState: "needs_reply",
    opportunityState: null,
    channel: "web_chat",
    ownerUserId: null,
    ownerLabel: null,
    unread: false,
    unreadCount: 0,
    nextAction: "reply",
    lastCustomerMessageAt: "2026-09-10T18:00:00Z",
    lastStaffMessageAt: null,
    updatedAt: "2026-09-10T18:00:00Z",
    version: 1,
    recordChips: [],
    ...partial,
  };
}

function msg(id: string, inquiryId: string, body: string, sender: string | null, createdAt: string): ThreadMessage {
  return {
    id,
    inquiryId,
    kind: "text",
    body,
    payload: null,
    senderUserId: sender,
    guestSessionId: sender ? null : "guest-1",
    createdAt,
    editedAt: null,
    deletedAt: null,
    internal: false,
    delivery: sender ? { channel: "web_chat", state: "sent" } : null,
  };
}
