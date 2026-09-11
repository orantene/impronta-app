export const CONVERSATION_STATES = ["needs_reply", "awaiting_customer", "resolved"] as const;
export type ConversationState = (typeof CONVERSATION_STATES)[number];

export const OPPORTUNITY_STATES = [
  "gathering",
  "offer_sent",
  "awaiting_acceptance",
  "accepted_awaiting_deposit",
  "won",
  "lost",
] as const;
export type OpportunityState = (typeof OPPORTUNITY_STATES)[number];

export const MESSAGING_CHANNELS = ["web_chat", "whatsapp", "sms", "email", "counter"] as const;
export type MessagingChannel = (typeof MESSAGING_CHANNELS)[number];

export const RECORD_KINDS = [
  "order",
  "appointment",
  "reservation",
  "class_enrolment",
  "tickets",
  "project",
  "offer",
] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

export const IDENTITY_LEVELS = ["none", "linked", "confirmed", "granted"] as const;
export type IdentityLevel = (typeof IDENTITY_LEVELS)[number];

export const IDENTITY_METHODS = ["phone", "email", "sms_code", "name_only", "staff"] as const;
export type IdentityMethod = (typeof IDENTITY_METHODS)[number];

export const CARD_KINDS = [
  "text",
  "menu_options",
  "item_config",
  "basket",
  "service_card",
  "professional_times",
  "class_card",
  "tickets_card",
  "offer_review",
  "offer_state",
  "payment_request",
  "order_confirmation",
  "appointment_confirmation",
  "change_request",
  "change_result",
  "reminder",
  "internal_note",
] as const;
export type CardKind = (typeof CARD_KINDS)[number];

export const CARD_STATES = [
  "sent",
  "viewed",
  "selected",
  "paid",
  "expired",
  "unavailable",
  "price_changed",
  "cancelled",
] as const;
export type CardState = (typeof CARD_STATES)[number];

export const INBOX_FILTERS = [
  "all",
  "unread",
  "unassigned",
  "mine",
  "needs_reply",
  "awaiting_customer",
  "resolved",
] as const;
export type InboxFilter = (typeof INBOX_FILTERS)[number];

export type MessagingRefusal =
  | "conflict"
  | "not_found"
  | "wrong_tenant"
  | "invalid"
  | "unavailable"
  | "channel_unavailable"
  | "template_required"
  | "rate_limited"
  | "checkout_locked"
  | "already_resolved"
  | "no_owner"
  | "identity_unconfirmed"
  | "already_linked"
  | "version_stale"
  | "payment_unknown"
  | "already_paid"
  | "hold_ended"
  | "basket_changed"
  | "not_allowed"
  | "expired"
  | "already";

export type ActionOk<T extends Record<string, unknown> = Record<string, never>> = { ok: true } & T;
export type ActionFail = { ok: false; reason: MessagingRefusal };
export type ActionResult<T extends Record<string, unknown> = Record<string, never>> = ActionOk<T> | ActionFail;

export type InboxRow = {
  id: string;
  tenantId: string;
  locationSlug: string;
  contactName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  conversationState: ConversationState;
  opportunityState: OpportunityState | null;
  channel: MessagingChannel;
  ownerUserId: string | null;
  unread: boolean;
  lastCustomerMessageAt: string | null;
  lastStaffMessageAt: string | null;
  updatedAt: string;
  version: number;
  recordChips: readonly RecordChip[];
};

export type RecordChip = {
  kind: RecordKind;
  recordId: string;
  label: string;
  paymentState: string | null;
  fulfilmentState: string | null;
};

export type ThreadMessage = {
  id: string;
  inquiryId: string;
  kind: CardKind | string;
  body: string;
  payload: Record<string, unknown> | null;
  senderUserId: string | null;
  guestSessionId: string | null;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  internal: boolean;
  delivery: { channel: string; state: string } | null;
};

export type CustomerMatchLevel = "phone" | "name_only" | "new";

export type Essentials = {
  customer: {
    name: string;
    email: string | null;
    phone: string | null;
    identityLevel: IdentityLevel;
    identityMethod: string | null;
  };
  linked: RecordChip[];
  notes: { id: string; body: string; createdAt: string }[];
};

export type CustomerMatch = {
  customerId: string | null;
  level: CustomerMatchLevel;
  displayName: string | null;
  email: string | null;
  phoneE164: string | null;
  score: number;
};
