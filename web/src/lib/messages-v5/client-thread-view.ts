/**
 * L9 (boards C01/C02): the client link thread, pure. Everything the client
 * screen needs to turn engine rows into what the client sees, with no React
 * and no server import, so it is testable on its own and shared by the view
 * and its render tests.
 *
 *   - `buildClientStream`: the same stream grammar as the staff thread (day
 *     separators, grouped bubbles, cards) from the CLIENT side: `mine` is a
 *     message with no staff sender. Internal notes never reach this function
 *     (`customerVisibleMessages` drops them server-side), but it drops them
 *     again anyway: a client reader excludes notes by rule (D-MSG-2).
 *   - Payload readers for the client cards: choices, times, offer, payment,
 *     confirmation, change request. Each reads ONLY the fields the client may
 *     see; the static test holds the list closed against staff-only money.
 *   - `clientOfferForEvent`: the engine writes an `offer_event` row when an
 *     offer is sent (`inquiry-engine-offers.ts`); the card is drawn from the
 *     live offer summary loaded beside the thread, keyed by `offer_id`.
 */

import type { ThreadMessage } from "@/lib/messaging/types";
import { formatOrderMoney } from "@/lib/orders/money-format";

export const CLIENT_GROUP_WINDOW_MS = 3 * 60 * 1000;

/** Kinds drawn as bubbles. `offer_event` is the engine's own "offer sent" row and is drawn as a card. */
export const CLIENT_BUBBLE_KINDS: ReadonlySet<string> = new Set(["text", "voice", "attachment", "file"]);

/** Kinds the client thread draws as an interactive or read-only card. */
export const CLIENT_CARD_KINDS = [
  "menu_options",
  "service_card",
  "class_card",
  "tickets_card",
  "professional_times",
  "offer_review",
  "offer_state",
  "offer_event",
  "payment_request",
  "basket",
  "order_confirmation",
  "appointment_confirmation",
  "change_request",
  "change_result",
] as const;
export type ClientCardKind = (typeof CLIENT_CARD_KINDS)[number];
const CARD_KIND_SET = new Set<string>(CLIENT_CARD_KINDS);

export type ClientBubblePosition = "single" | "first" | "middle" | "last";

export type ClientStreamItem =
  | { readonly kind: "day"; readonly key: string; readonly date: Date }
  | { readonly kind: "message"; readonly key: string; readonly message: ThreadMessage; readonly position: ClientBubblePosition; readonly mine: boolean }
  | { readonly kind: "system"; readonly key: string; readonly message: ThreadMessage }
  | { readonly kind: "card"; readonly key: string; readonly message: ThreadMessage; readonly cardKind: ClientCardKind };

export function isClientCardKind(kind: string): kind is ClientCardKind {
  return CARD_KIND_SET.has(kind);
}

/** From the client's side: no staff sender and not a note. */
export function isMine(message: Pick<ThreadMessage, "senderUserId" | "internal" | "system">): boolean {
  return message.senderUserId === null && !message.internal && !message.system;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const HIDDEN_CLIENT_SYSTEM_EVENTS = new Set(["offer_sent", "offer_accepted", "approvals_complete", "all_approvals_complete", "talent_approved"]);

export function buildClientStream(messages: readonly ThreadMessage[]): ClientStreamItem[] {
  // One offer card per offer; the engine's own "Offer sent" / approvals
  // lines are the same fact as the card and stay out of the client's stream.
  const offerCards = offerCardMessageIds(messages);
  const live = messages.filter((m) => {
    if (m.internal || m.kind === "internal_note") return false;
    if (m.kind === "offer_event" || m.kind === "offer_review") return offerCards.has(m.id);
    if (m.system && m.systemEvent && HIDDEN_CLIENT_SYSTEM_EVENTS.has(m.systemEvent)) return false;
    return !m.deletedAt || CLIENT_BUBBLE_KINDS.has(m.kind);
  });
  const items: ClientStreamItem[] = [];
  let lastDay: Date | null = null;
  let prev: { index: number; mine: boolean; at: number } | null = null;

  for (const m of live) {
    const at = new Date(m.createdAt);
    if (!lastDay || !sameDay(lastDay, at)) {
      items.push({ kind: "day", key: `day:${m.id}`, date: at });
      lastDay = at;
      prev = null;
    }
    if (CLIENT_BUBBLE_KINDS.has(m.kind)) {
      const mine = isMine(m);
      const grouped = prev !== null && prev.mine === mine && at.getTime() - prev.at <= CLIENT_GROUP_WINDOW_MS;
      if (grouped && prev) {
        const p = items[prev.index];
        if (p.kind === "message") items[prev.index] = { ...p, position: p.position === "single" ? "first" : "middle" };
      }
      items.push({ kind: "message", key: m.id, message: m, position: grouped ? "last" : "single", mine });
      prev = { index: items.length - 1, mine, at: at.getTime() };
      continue;
    }
    prev = null;
    if (isClientCardKind(m.kind)) items.push({ kind: "card", key: m.id, message: m, cardKind: m.kind });
    else items.push({ kind: "system", key: m.id, message: m });
  }
  return items;
}

/* ---------- formatting ---------- */

export function money(cents: unknown, currency: unknown): string {
  return formatOrderMoney(typeof cents === "number" && Number.isFinite(cents) ? Math.round(cents) : 0, typeof currency === "string" && currency ? currency : "USD");
}

export function formatClientTime(iso: string, locale = "en", timeZone?: string | null): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: timeZone || undefined }).format(d);
  } catch {
    return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(d);
  }
}

export function formatClientDate(iso: string, locale = "en", timeZone?: string | null): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", timeZone: timeZone || undefined }).format(d);
  } catch {
    return new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric" }).format(d);
  }
}

export function formatSlot(iso: string, locale = "en", timeZone?: string | null): string {
  const date = formatClientDate(iso, locale, timeZone);
  const time = formatClientTime(iso, locale, timeZone);
  return [date, time].filter(Boolean).join(" · ");
}

/**
 * The slot the staff context panel should show for a live hold.
 * Same formatter as the guest card (`formatSlot` + payload timezone).
 * Newest professional_times wins; a picked start beats the first offered slot.
 */
export function holdSlotLabelFromMessages(
  messages: readonly { readonly kind: string; readonly payload: Record<string, unknown> | null }[],
  locale = "en",
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message || message.kind !== "professional_times") continue;
    const times = readTimes(message.payload);
    const iso = times.pickedStartsAt ?? times.slots[0]?.startsAt ?? null;
    if (!iso) continue;
    const label = formatSlot(iso, locale, times.timezone);
    return label || null;
  }
  return null;
}

export function dayLabelFor(date: Date, copy: { readonly today: string; readonly yesterday: string }, now: Date, locale = "en"): string {
  if (sameDay(date, now)) return copy.today;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(date, y)) return copy.yesterday;
  const sameYear = date.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(locale, sameYear ? { weekday: "short", month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" }).format(date);
}

/** "12:41" style countdown; null once the moment has passed. */
export function holdCountdown(expiresAtIso: string | null | undefined, now: Date): string | null {
  if (!expiresAtIso) return null;
  const left = Date.parse(expiresAtIso) - now.getTime();
  if (!Number.isFinite(left) || left <= 0) return null;
  const totalSeconds = Math.floor(left / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/* ---------- payload readers (client-safe fields only) ---------- */

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : String(x ?? ""))) : [];
}

export type ChoiceOption = { readonly id: string; readonly label: string; readonly priceCents: number | null; readonly sessionId?: string | null };

export type ChoicesView = {
  readonly title: string | null;
  readonly options: readonly ChoiceOption[];
  readonly currency: string;
  /** Picks already sent from this link (payload `chosenIds`, written by `messagingClientChoose`). */
  readonly chosenIds: readonly string[];
  readonly multiple: boolean;
};

/** menu_options / service_card carry parallel arrays; class_card / tickets_card carry one item (tiers become options). */
export function readChoices(kind: ClientCardKind, payload: Record<string, unknown> | null): ChoicesView {
  const p = payload ?? {};
  const currency = str(p.currency) ?? "USD";
  const chosenIds = strList(p.chosenIds);
  if (kind === "class_card") {
    const id = str(p.offeringId) ?? str(p.sessionId) ?? "";
    return { title: str(p.title), options: id ? [{ id, label: str(p.title) ?? "", priceCents: num(p.priceCents), sessionId: str(p.sessionId) }] : [], currency, chosenIds, multiple: false };
  }
  if (kind === "tickets_card") {
    const tiers = Array.isArray(p.tiers) ? (p.tiers as Array<Record<string, unknown>>) : [];
    const offeringId = str(p.offeringId);
    return {
      title: str(p.title),
      options: tiers.map((t) => ({ id: str(t.id) ?? offeringId ?? "", label: str(t.label) ?? "", priceCents: num(t.priceCents), sessionId: str(p.sessionId) })).filter((o) => o.id),
      currency,
      chosenIds,
      multiple: false,
    };
  }
  const ids = strList(p.offeringIds);
  const labels = strList(p.labels);
  const prices = Array.isArray(p.pricesCents) ? (p.pricesCents as unknown[]) : [];
  const options = ids.map((id, i) => ({ id, label: labels[i] ?? id, priceCents: num(prices[i]) })).filter((o) => o.id);
  return { title: str(p.title), options, currency, chosenIds, multiple: kind === "menu_options" };
}

export type TimesView = {
  readonly professionalName: string | null;
  readonly slots: readonly { readonly startsAt: string }[];
  readonly timezone: string | null;
  readonly pickedStartsAt: string | null;
  readonly holdExpiresAt: string | null;
};

export function readTimes(payload: Record<string, unknown> | null): TimesView {
  const p = payload ?? {};
  const slots = Array.isArray(p.slots) ? (p.slots as Array<Record<string, unknown>>) : [];
  return {
    professionalName: slots.map((s) => str(s.professionalName)).find((n) => n) ?? null,
    slots: slots.map((s) => ({ startsAt: str(s.startsAt) ?? "" })).filter((s) => s.startsAt),
    timezone: str(p.timezone),
    pickedStartsAt: str(p.pickedStartsAt),
    holdExpiresAt: str(p.holdExpiresAt),
  };
}

export type TimesState = "sent" | "picked" | "hold_ended";

export function timesState(view: TimesView, now: Date): TimesState {
  if (!view.pickedStartsAt) return "sent";
  if (view.holdExpiresAt && Date.parse(view.holdExpiresAt) <= now.getTime()) return "hold_ended";
  return "picked";
}

/**
 * The client-safe offer summary the page loads beside the thread
 * (`lib/messaging/client-link.ts`). Total, deposit, validity, lines with a
 * label and a client price. No net, no commission, no payout, no discount or
 * tax breakdown: the static test holds this type closed.
 */
export type ClientOfferSummary = {
  readonly id: string;
  readonly version: number;
  readonly status: string;
  readonly totalCents: number;
  readonly currency: string;
  readonly depositPct: number | null;
  readonly depositCents: number | null;
  readonly refundPolicy: string | null;
  readonly validUntil: string | null;
  readonly noteToClient: string | null;
  readonly lines: readonly { readonly label: string; readonly units: number; readonly amountCents: number }[];
};

export type OfferCardState = "sent" | "accepted" | "declined" | "expired";

export function offerCardState(offer: ClientOfferSummary, now: Date): OfferCardState {
  if (offer.status === "accepted") return "accepted";
  if (offer.status === "rejected" || offer.status === "declined" || offer.status === "invalidated") return "declined";
  if (offer.status === "expired" || offer.status === "superseded") return "expired";
  if (offer.validUntil && Date.parse(offer.validUntil) < now.getTime()) return "expired";
  return "sent";
}

/** The deposit the accept button names: an explicit amount wins, else pct of total, else null (accept only). */
export function offerDepositCents(offer: Pick<ClientOfferSummary, "depositPct" | "depositCents" | "totalCents">): number | null {
  if (offer.depositCents != null && offer.depositCents > 0) return Math.round(offer.depositCents);
  if (offer.depositPct != null && offer.depositPct > 0) return Math.round((offer.totalCents * offer.depositPct) / 100);
  return null;
}

/** The message ids that draw an offer card: the LAST "sent" `offer_event` per offer id (a re-sent offer writes a second event; one card per offer). */
export function offerCardMessageIds(messages: readonly Pick<ThreadMessage, "id" | "kind" | "payload">[]): Set<string> {
  const last = new Map<string, string>();
  for (const m of messages) {
    if (m.kind !== "offer_event" && m.kind !== "offer_review") continue;
    const p = m.payload ?? {};
    const id = str(p.offer_id) ?? str(p.offerId);
    if (!id) continue;
    if (m.kind === "offer_event" && str(p.status) !== "sent") continue;
    last.set(id, m.id);
  }
  return new Set(last.values());
}

/** The offer an `offer_event` / `offer_review` / `offer_state` row points at, or null when the summary is not loaded (draft, hidden, gone). */
export function clientOfferForMessage(payload: Record<string, unknown> | null, offers: readonly ClientOfferSummary[]): ClientOfferSummary | null {
  const p = payload ?? {};
  const id = str(p.offer_id) ?? str(p.offerId);
  if (!id) return null;
  return offers.find((o) => o.id === id) ?? null;
}

export type PaymentView = { readonly code: string | null; readonly amountCents: number | null; readonly currency: string; readonly amountKind: string | null; readonly expiresAt: string | null; readonly state: string };

export function readPayment(payload: Record<string, unknown> | null): PaymentView {
  const p = payload ?? {};
  return { code: str(p.paymentLinkCode), amountCents: num(p.amountCents), currency: str(p.currency) ?? "USD", amountKind: str(p.amountKind), expiresAt: str(p.expiresAt), state: str(p.state) ?? "sent" };
}

export type ConfirmationView = { readonly recordKind: string | null; readonly recordId: string | null; readonly when: string | null; readonly title: string | null; readonly summary: string | null; readonly receiptCode: string | null; readonly lines: readonly { readonly label: string; readonly units: number; readonly amountCents: number }[]; readonly currency: string };

export function readConfirmation(payload: Record<string, unknown> | null): ConfirmationView {
  const p = payload ?? {};
  const rawLines = Array.isArray(p.lines) ? (p.lines as Array<Record<string, unknown>>) : [];
  return {
    recordKind: str(p.recordKind),
    recordId: str(p.recordId),
    when: str(p.when) ?? str(p.promisedAt),
    title: str(p.title),
    summary: str(p.summary),
    receiptCode: str(p.receiptCode),
    lines: rawLines.map((l) => ({ label: str(l.label) ?? "", units: num(l.units) ?? 1, amountCents: (num(l.unitCents) ?? 0) * (num(l.units) ?? 1) })),
    currency: str(p.currency) ?? "USD",
  };
}

export type TicketsView = {
  readonly title: string | null;
  readonly tiers: readonly ChoiceOption[];
  readonly currency: string;
  readonly state: string;
  /** Short code for `/q/<code>` when the engine stamped one on the card. */
  readonly ticketCode: string | null;
};

const TICKETS_ISSUED = new Set(["paid", "issued", "checked_in", "selected"]);

/** The door/QR code the staff kit already opens at `/q/<code>`. Null when the engine never stamped one (D-MSG-215). */
function ticketCodeFrom(p: Record<string, unknown>): string | null {
  const raw = str(p.ticketCode) ?? str(p.code) ?? str(p.qrCode) ?? str(p.linkCode) ?? str(p.ticketUrl);
  if (!raw) return null;
  const fromPath = raw.match(/\/q\/([^/?#]+)/);
  if (fromPath?.[1]) return fromPath[1];
  if (/^[A-Za-z0-9_-]{2,64}$/.test(raw)) return raw;
  return null;
}

export function readTickets(payload: Record<string, unknown> | null): TicketsView {
  const p = payload ?? {};
  const choices = readChoices("tickets_card", p);
  return {
    title: choices.title,
    tiers: choices.options,
    currency: choices.currency,
    state: (str(p.state) ?? "sent").toLowerCase(),
    ticketCode: ticketCodeFrom(p),
  };
}

/** Paid / issued / checked-in: the client leaves the chooser for a ticket card. */
export function ticketsIssued(view: TicketsView): boolean {
  return TICKETS_ISSUED.has(view.state);
}

export type ChangeView = {
  readonly title: string | null;
  readonly body: string | null;
  readonly state: "sent" | "applied" | "declined" | "cancelled";
  readonly oldWhen: string | null;
  readonly newWhen: string | null;
  readonly refundedCents: number | null;
  readonly currency: string;
};

function isCancelOrRefundPayload(p: Record<string, unknown>): boolean {
  if (typeof p.refundedCents === "number") return true;
  const summary = str(p.summary) ?? "";
  return /^cancelled/i.test(summary) || /^refunded/i.test(summary);
}

export function readChange(kind: ClientCardKind, payload: Record<string, unknown> | null, body: string): ChangeView {
  const p = payload ?? {};
  const raw = str(p.state);
  const refundedCents = num(p.refundedCents);
  const currency = str(p.currency) ?? "USD";
  let state: ChangeView["state"];
  if (kind === "change_result" && isCancelOrRefundPayload(p)) {
    state = "cancelled";
  } else if (kind === "change_result") {
    state = raw === "cancelled" || raw === "unavailable" ? "declined" : "applied";
  } else if (raw === "selected" || raw === "paid") {
    state = "applied";
  } else if (raw === "cancelled" || raw === "unavailable") {
    state = "declined";
  } else {
    state = "sent";
  }
  return { title: str(p.title), body: str(p.summary) ?? str(body), state, oldWhen: str(p.oldWhen), newWhen: str(p.newWhen), refundedCents, currency };
}

/** First name for "<name> is handling your request". */
export function firstName(displayName: string | null | undefined): string | null {
  const s = (displayName ?? "").trim();
  if (!s) return null;
  return s.split(/\s+/)[0] ?? null;
}
