/**
 * guest-instant-answer.ts — F-09. A guest's first question about a service's
 * price or duration is answered on the spot from the talent's PUBLIC services
 * (the same data the site already prints), with no name/email wall. Identity is
 * asked only when the guest wants to book or wants a person to reply, which is
 * the normal first-send path. Pure: no React, no backend.
 *
 * Returns null when the text is not a price/duration question, or the services
 * hold nothing to answer with. The caller then falls through to the usual gate.
 */

import type { GuestChatOffering } from "@/lib/inquiry/guest-chat-contract";
import type { Translator } from "@/i18n/interpolate";
import { interpolate } from "@/i18n/interpolate";
import { guestDockServicePriceLabel } from "./guest-dock-service-price";

type Intent = { price: boolean; duration: boolean };

const PRICE_RE =
  /\b(price|prices|cost|costs|how much|rate|rates|fee|precio|precios|cuesta|cuestan|costo|costos|cuanto|tarifa|tarifas|prix|combien|tarif)\b/;
const DURATION_RE =
  /\b(how long|duration|minutes|hours|takes|duracion|dura|duran|tarda|tardan|minutos|horas|cuanto tiempo|duree|combien de temps)\b/;
/** A message carrying booking/contact intent is a real inquiry, not a quick question. */
const BOOKING_RE =
  /\b(book|booking|reserve|reservation|appointment|available|availability|reservar|reserva|cita|agendar|disponible|disponibilidad|quiero|me gustaria|reserver|rendez)\b/;

const MAX_LINES = 4;
const STOP = new Set([
  "de", "del", "la", "el", "los", "las", "un", "una", "the", "and", "for", "con", "por", "para", "que", "cuanto",
  "cuesta", "price", "cost", "how", "much", "does", "duration", "long", "tiene", "precio",
]);

export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Which of price / duration the guest is asking about. Booking intent returns null. */
export function detectServiceQuestion(text: string): Intent | null {
  const n = normalizeForMatch(text);
  if (!n || n.length > 200) return null;
  if (BOOKING_RE.test(n)) return null;
  const price = PRICE_RE.test(n);
  const duration = DURATION_RE.test(n);
  if (!price && !duration) return null;
  return { price, duration };
}

function stem(w: string): string {
  return w.length > 4 ? w.replace(/(es|s)$/, "") : w;
}

function tokens(s: string): string[] {
  return normalizeForMatch(s)
    .split(" ")
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

/** Offerings whose title shares a meaningful word with the question. */
export function matchOfferings(text: string, offerings: readonly GuestChatOffering[]): GuestChatOffering[] {
  const q = new Set(tokens(text).map(stem));
  if (q.size === 0) return [];
  return offerings.filter((o) => tokens(o.title).some((w) => q.has(stem(w))));
}

export function formatDuration(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

function priceOf(o: GuestChatOffering, locale: string): string | null {
  if (o.priceLabel && o.priceLabel.trim()) return o.priceLabel.trim();
  return guestDockServicePriceLabel(o.amountCents, o.currency, null, locale);
}

/**
 * The instant reply text, or null when it cannot answer from real data.
 * With no service named, it lists the services that have the asked fact, but only
 * when the menu is short enough to read as an answer.
 */
export function buildInstantServiceAnswer(args: {
  text: string;
  offerings: readonly GuestChatOffering[];
  locale: string;
  t: Translator;
}): string | null {
  const intent = detectServiceQuestion(args.text);
  if (!intent) return null;
  const usable = args.offerings.filter((o) => o.title.trim() && o.offeringId !== "default-custom-quote");
  const named = matchOfferings(args.text, usable);
  if (named.length === 0 && usable.length > MAX_LINES) return null;
  const pool = named.length > 0 ? named : usable;
  const lines: string[] = [];
  for (const o of pool) {
    const price = intent.price ? priceOf(o, args.locale) : null;
    const dur = intent.duration && o.durationMinutes && o.durationMinutes > 0 ? formatDuration(o.durationMinutes) : null;
    if (!price && !dur) continue;
    const template =
      price && dur
        ? args.t("public.guestChat.instantAnsBoth")
        : price
          ? args.t("public.guestChat.instantAnsPrice")
          : args.t("public.guestChat.instantAnsDuration");
    lines.push(interpolate(template, { title: o.title.trim(), price: price ?? "", duration: dur ?? "" }));
    if (lines.length >= MAX_LINES) break;
  }
  if (lines.length === 0) return null;
  return `${lines.join("\n")}\n\n${args.t("public.guestChat.instantAnsMore")}`;
}

/** Local-only rows (never persisted): the guest's question and the instant answer. */
export function buildInstantRows(question: string, answer: string, now: Date = new Date()) {
  const base = now.getTime();
  const mk = (id: string, role: "guest" | "talent", body: string, ms: number) => ({
    id,
    inquiryId: "",
    authorRole: role,
    authorLabel: null,
    authorAvatarUrl: null,
    body,
    kind: "text" as const,
    cardPayload: null,
    createdAt: new Date(base + ms).toISOString(),
    editedAt: null,
    isDeleted: false,
    replyToMessageId: null,
  });
  return [mk(`local-q-${base}`, "guest", question, 0), mk(`local-a-${base}`, "talent", answer, 1)];
}

/**
 * The first-send gate as one decision. A first message with no contact details
 * is answered instantly when the services can answer it; otherwise identity is
 * asked. A guest who already gave contact details just sends.
 */
export function firstSendDecision(args: {
  hasContact: boolean;
  instantAnswer: string | null;
}): "answer" | "send" | "ask_identity" {
  if (args.hasContact) return "send";
  return args.instantAnswer ? "answer" : "ask_identity";
}
