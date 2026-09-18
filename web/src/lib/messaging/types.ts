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
  | "already"
  | "deposit_required"
  /** S6 (D-MSG-41): off-platform settle refused because no payout receiver
   * exists for this workspace/payee — a known gap in the cash-settlement
   * path, not a caller error. */
  | "no_payout_receiver";

export type ActionOk<T extends Record<string, unknown> = Record<string, never>> = { ok: true } & T;
export type ActionFail = { ok: false; reason: MessagingRefusal };
export type ActionResult<T extends Record<string, unknown> = Record<string, never>> = ActionOk<T> | ActionFail;

export const NEXT_ACTIONS = ["reply", "assign", "collect", "follow_up"] as const;
export type InboxNextAction = (typeof NEXT_ACTIONS)[number];

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
  ownerLabel: string | null;
  unread: boolean;
  unreadCount: number;
  subject: string;
  lastMessagePreview: string;
  nextAction: InboxNextAction | null;
  lastCustomerMessageAt: string | null;
  lastStaffMessageAt: string | null;
  updatedAt: string;
  version: number;
  recordChips: readonly RecordChip[];
};

/**
 * The three state families of a thread as a workspace row carries them
 * (contract seam 4): drawn as three separate chip groups, never one word.
 */
export type InquiryMessagingState = {
  conversation: ConversationState;
  opportunity: OpportunityState | null;
  records: Array<{ kind: RecordKind; recordId: string }>;
};

export type RecordChip = {
  kind: RecordKind;
  recordId: string;
  label: string;
  paymentState: string | null;
  fulfilmentState: string | null;
  /** S2: the date the record is FOR (order pickup/created, appointment start,
   * event date, reservation start). ISO or null when the writer has not
   * synced it yet. Additive. */
  recordDate?: string | null;
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
  /** D-MSG-2: "private" is the client thread, "group" the talent thread. */
  thread: "private" | "group";
  internal: boolean;
  delivery: { channel: string; state: string } | null;
  /** Engine-authored line (auto-ack, "inquiry_created", ...): metadata.system_event_type
   * is set and there is no sender. Drawn as a system line, never as a client bubble. */
  system?: boolean;
  /** metadata.system_event_type of an engine line ("offer_sent", "inquiry_created", ...). */
  systemEvent?: string | null;
};

export type CustomerMatchLevel = "phone" | "name_only" | "new";

export type Essentials = {
  /** Internal name/subject the workspace shows (contract seam S4: rename).
   * Starts as `customer.name`/contact name and is overridden by the latest
   * successful `messaging_rename` action-log entry. Never blank. */
  name: string;
  /** The inquiry row's own optimistic-lock counter, so a rename UI can send
   * it straight back as `expectedVersion`. */
  version: number;
  customer: {
    name: string;
    email: string | null;
    phone: string | null;
    identityLevel: IdentityLevel;
    identityMethod: string | null;
    request: string | null;
    source: string | null;
  };
  linked: RecordChip[];
  notes: { id: string; body: string; createdAt: string }[];
};

/**
 * S4: one line of conversation history — an inquiry_action_log row or an
 * inquiry_events row rendered as a sentence. `kind` is the stable code the UI
 * uses to pick a `dashboard.pos.messages.history.*` catalogue key; `text` is
 * the EN sentence rendered server-side.
 */
export const HISTORY_KINDS = [
  "rename",
  "assignment",
  "handover",
  "resolve",
  "reopen",
  "close_lost",
  "merge",
  "offer_sent",
  "offer_accepted",
  "offer_declined",
  "payment_link_created",
  "payment_paid",
  "payment_failed",
  "payment_expired",
  "payment_refunded",
  "booking_confirmed",
  "booking_cancelled",
  "booking_rescheduled",
  /** L3, D-MSG-91: a staff edit of the client's phone/email/name from the
   * D15 ClientSheet, best-effort logged after `updateInquiryDetails` or
   * `messaging_set_identity` succeeds. */
  "client_edit",
] as const;
export type HistoryKind = (typeof HISTORY_KINDS)[number];

export type ConversationHistoryEntry = {
  at: string;
  actorLabel: string;
  kind: HistoryKind;
  text: string;
};

/**
 * S4: one derived task on a conversation. `deriveTasks` (web/src/lib/messaging/tasks.ts)
 * is a pure function over state — no free-text tasks in v1 (owner decision 7).
 * The list is priority-ordered; exactly the first entry carries `primary: true`.
 */
export type DerivedTask = {
  key: string;
  title: string;
  why: string;
  primary: boolean;
};

export type CustomerMatch = {
  customerId: string | null;
  level: CustomerMatchLevel;
  displayName: string | null;
  email: string | null;
  phoneE164: string | null;
  score: number;
};
