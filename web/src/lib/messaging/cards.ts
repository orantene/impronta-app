import { CARD_KINDS, CARD_STATES, type CardKind, type CardState } from "./types";

export type CardRenderAudience = "operator" | "customer" | "sms";

export type CardRenderModel = {
  kind: CardKind;
  state: CardState;
  title: string;
  summary: string;
  smsText: string;
  actions: readonly string[];
  payload: Record<string, unknown>;
};

type PayloadBase = {
  state?: CardState;
  title?: string;
  summary?: string;
};

export type MenuOptionsPayload = PayloadBase & {
  offeringIds: string[];
  labels: string[];
  pricesCents: number[];
  currency: string;
};

export type ItemConfigPayload = PayloadBase & {
  offeringId: string;
  label: string;
  extras: string[];
  units: number;
  unitCents: number;
  currency: string;
};

export type BasketPayload = PayloadBase & {
  orderId: string;
  version: number;
  lines: { label: string; units: number; unitCents: number }[];
  currency: string;
  promisedAt?: string | null;
};

export type ServiceCardPayload = PayloadBase & {
  offeringIds: string[];
  labels: string[];
  depositCents?: number | null;
  currency: string;
};

export type ProfessionalTimesPayload = PayloadBase & {
  slots: { startsAt: string; professionalName: string | null }[];
  timezone: string;
};

export type ClassCardPayload = PayloadBase & {
  sessionId: string;
  title: string;
  startsAt: string;
  seatsLeft: number | null;
  waitlist: boolean;
};

export type TicketsCardPayload = PayloadBase & {
  eventId: string;
  title: string;
  tiers: { id: string; label: string; priceCents: number }[];
  currency: string;
};

export type OfferReviewPayload = PayloadBase & {
  offerId: string;
  version: number;
  totalCents: number;
  currency: string;
  validUntil: string | null;
};

export type OfferStatePayload = PayloadBase & {
  offerId: string;
  version: number;
  offerStatus: string;
};

export type PaymentRequestPayload = PayloadBase & {
  paymentLinkCode: string;
  amountCents: number;
  currency: string;
  amountKind: "deposit" | "full" | "none";
  expiresAt: string;
  reservationId: string | null;
};

export type ConfirmationPayload = PayloadBase & {
  recordKind: string;
  recordId: string;
  when: string | null;
};

export type ChangeRequestPayload = PayloadBase & {
  recordKind: string;
  recordId: string;
  requestedAt: string;
  hoursBefore: number;
  freeUntil: string | null;
  oldWhen: string | null;
  newWhen: string | null;
};

export type ReminderPayload = PayloadBase & {
  sendAt: string;
  body: string;
};

export type InternalNotePayload = PayloadBase & {
  body: string;
};

export type CardPayload =
  | MenuOptionsPayload
  | ItemConfigPayload
  | BasketPayload
  | ServiceCardPayload
  | ProfessionalTimesPayload
  | ClassCardPayload
  | TicketsCardPayload
  | OfferReviewPayload
  | OfferStatePayload
  | PaymentRequestPayload
  | ConfirmationPayload
  | ChangeRequestPayload
  | ReminderPayload
  | InternalNotePayload
  | PayloadBase;

const KIND_SET = new Set<string>(CARD_KINDS);
const STATE_SET = new Set<string>(CARD_STATES);

export function isCardKind(value: string): value is CardKind {
  return KIND_SET.has(value);
}

export function readCardState(payload: Record<string, unknown> | null): CardState {
  const raw = payload && typeof payload.state === "string" ? payload.state : "sent";
  return STATE_SET.has(raw) ? (raw as CardState) : "sent";
}

export function renderCard(
  kind: string,
  payload: Record<string, unknown> | null,
  audience: CardRenderAudience,
): CardRenderModel {
  const safeKind: CardKind = isCardKind(kind) ? kind : "text";
  const state = readCardState(payload);
  const p = payload ?? {};
  const title = str(p.title) ?? defaultTitle(safeKind);
  const summary = str(p.summary) ?? defaultSummary(safeKind, p);
  const smsText = smsFallback(safeKind, title, summary, p);
  const actions = audience === "sms" ? [] : defaultActions(safeKind, audience, state);
  return { kind: safeKind, state, title, summary, smsText, actions, payload: p };
}

export function everyKindHasRenderers(): { kind: CardKind; operator: boolean; customer: boolean; sms: boolean }[] {
  return CARD_KINDS.map((kind) => {
    const modelOp = renderCard(kind, { state: "sent" }, "operator");
    const modelCu = renderCard(kind, { state: "sent" }, "customer");
    const modelSms = renderCard(kind, { state: "sent" }, "sms");
    return {
      kind,
      operator: modelOp.actions.length > 0 || kind === "internal_note" || kind === "text",
      customer: kind === "internal_note" ? modelCu.actions.length === 0 : modelCu.title.length > 0,
      sms: modelSms.smsText.length > 0,
    };
  });
}

function defaultTitle(kind: CardKind): string {
  switch (kind) {
    case "menu_options":
      return "Menu options";
    case "item_config":
      return "Configure item";
    case "basket":
      return "Basket";
    case "service_card":
      return "Services";
    case "professional_times":
      return "Times";
    case "class_card":
      return "Class";
    case "tickets_card":
      return "Tickets";
    case "offer_review":
      return "Offer";
    case "offer_state":
      return "Offer state";
    case "payment_request":
      return "Payment";
    case "order_confirmation":
      return "Order confirmed";
    case "appointment_confirmation":
      return "Appointment confirmed";
    case "change_request":
      return "Change request";
    case "change_result":
      return "Change confirmed";
    case "reminder":
      return "Reminder";
    case "internal_note":
      return "Internal note";
    default:
      return "Message";
  }
}

function defaultSummary(kind: CardKind, payload: Record<string, unknown>): string {
  if (kind === "payment_request") {
    const cents = num(payload.amountCents);
    const currency = str(payload.currency) ?? "";
    if (cents != null) return `${currency} ${(cents / 100).toFixed(2)}`.trim();
  }
  if (kind === "basket") {
    const lines = Array.isArray(payload.lines) ? payload.lines.length : 0;
    return `${lines} line${lines === 1 ? "" : "s"}`;
  }
  return str(payload.summary) ?? "";
}

function defaultActions(kind: CardKind, audience: CardRenderAudience, state: CardState): string[] {
  if (kind === "internal_note") return audience === "operator" ? ["keep"] : [];
  if (state === "expired" || state === "cancelled" || state === "unavailable") return [];
  if (kind === "payment_request" && audience === "customer" && state !== "paid") return ["pay"];
  if (kind === "offer_review" && audience === "customer") return ["accept", "changes", "decline"];
  if (kind === "menu_options" && audience === "customer") return ["choose"];
  if (kind === "basket" && audience === "customer") return ["pay"];
  if (kind === "change_request" && audience === "operator") return ["apply_policy"];
  if (audience === "operator") return ["open"];
  return [];
}

function smsFallback(
  kind: CardKind,
  title: string,
  summary: string,
  payload: Record<string, unknown>,
): string {
  const link = str(payload.paymentLinkCode)
    ? `/pay/${str(payload.paymentLinkCode)}`
    : str(payload.threadUrl) ?? "";
  const parts = [title, summary, link].filter((part) => part.length > 0);
  if (kind === "internal_note") return "";
  return parts.join(" · ");
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
