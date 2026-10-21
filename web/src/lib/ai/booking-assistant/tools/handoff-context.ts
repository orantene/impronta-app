/**
 * TUL-36 slice 4: the HANDOFF TO A PERSON. Pure, no I/O, no money.
 *
 * When the assistant is unsure (or a tool is unavailable, a service is unknown, a payment is
 * not possible) it hands the chat to a person. Today the handoff is one canned line. This
 * adds the CONTEXT the person needs so they do not start from zero: why it handed off, what
 * the guest asked, which public service they were looking at and what the assistant had
 * already shown (a computed price, a number of open times).
 *
 * Privacy / safety rules:
 *  - the context is stored in the SAME private thread message the handoff already posts
 *    (`metadata.handoff_context`); nothing new is sent anywhere and no model is called;
 *  - only the title of a PUBLIC service the assistant was grounded on may appear (the caller
 *    passes it); a hidden or unknown service is passed as null and never named;
 *  - the guest's own words are capped and stripped of control characters; no ids are stored
 *    (no offering id, talent id or order id);
 *  - the reason set is closed; unknown stored values read back as null (fail closed).
 */
import {
  bookingAssistantHandoffCopy,
  bookingAssistantDisclosureLabel,
  type BookingAssistantLocale,
  type BookingHandoffReason,
} from "../handoff";

export type HandoffContextReason =
  | BookingHandoffReason
  | "bad_tool_call"
  | "tool_unavailable"
  | "unknown_service"
  | "not_sellable"
  | "inquiry_only"
  | "payment_unavailable"
  | "money_off";

const REASONS: readonly HandoffContextReason[] = [
  "unsure", "human_requested", "turn_ceiling", "gated", "off", "bad_tool_call", "tool_unavailable",
  "unknown_service", "not_sellable", "inquiry_only", "payment_unavailable", "money_off",
];

export const HANDOFF_GUEST_TEXT_MAX = 280;

export type HandoffShown =
  | { kind: "quote"; priceLabel: string }
  | { kind: "times"; count: number }
  | null;

export type HandoffContext = {
  v: 1;
  reason: HandoffContextReason;
  locale: BookingAssistantLocale;
  /** the guest's last message, capped */
  guestAsked: string | null;
  /** title of a PUBLIC service the assistant was grounded on; never a hidden one */
  serviceTitle: string | null;
  shown: HandoffShown;
};

function clean(text: string | null | undefined, max: number): string | null {
  // eslint-disable-next-line no-control-regex -- guest text is stored in a note; no control characters
  const t = (text ?? "").replace(/[\x00-\x1F\x7F]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 3).trimEnd()}...` : t;
}

export function buildHandoffContext(input: {
  reason: HandoffContextReason;
  locale: BookingAssistantLocale;
  guestMessage?: string | null;
  serviceTitle?: string | null;
  shown?: HandoffShown;
}): HandoffContext {
  const shown = input.shown ?? null;
  return {
    v: 1,
    reason: input.reason,
    locale: input.locale,
    guestAsked: clean(input.guestMessage, HANDOFF_GUEST_TEXT_MAX),
    serviceTitle: clean(input.serviceTitle, 120),
    shown:
      shown?.kind === "quote"
        ? { kind: "quote", priceLabel: clean(shown.priceLabel, 40) ?? "" }
        : shown?.kind === "times" && Number.isInteger(shown.count) && shown.count > 0
          ? { kind: "times", count: Math.min(shown.count, 6) }
          : null,
  };
}

/** What gets merged into the handoff message's `metadata` (alongside `handoff_reason`). */
export function handoffMetadata(ctx: HandoffContext): { handoff_reason: HandoffContextReason; handoff_context: HandoffContext } {
  return { handoff_reason: ctx.reason, handoff_context: ctx };
}

/** Reads a stored `handoff_context` back. Anything malformed is null (fail closed). */
export function readHandoffContext(raw: unknown): HandoffContext | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return null;
  if (typeof o.reason !== "string" || !REASONS.includes(o.reason as HandoffContextReason)) return null;
  const locale: BookingAssistantLocale = o.locale === "es" ? "es" : "en";
  const shownRaw = o.shown as Record<string, unknown> | null | undefined;
  const shown: HandoffShown =
    shownRaw && shownRaw.kind === "quote" && typeof shownRaw.priceLabel === "string"
      ? { kind: "quote", priceLabel: clean(shownRaw.priceLabel, 40) ?? "" }
      : shownRaw && shownRaw.kind === "times" && typeof shownRaw.count === "number" && Number.isInteger(shownRaw.count) && shownRaw.count > 0
        ? { kind: "times", count: Math.min(shownRaw.count, 6) }
        : null;
  return {
    v: 1,
    reason: o.reason as HandoffContextReason,
    locale,
    guestAsked: typeof o.guestAsked === "string" ? clean(o.guestAsked, HANDOFF_GUEST_TEXT_MAX) : null,
    serviceTitle: typeof o.serviceTitle === "string" ? clean(o.serviceTitle, 120) : null,
    shown,
  };
}

const WHY: Record<BookingAssistantLocale, Record<HandoffContextReason, string>> = {
  en: {
    unsure: "the assistant was not sure",
    human_requested: "the guest asked for a person",
    turn_ceiling: "the assistant reached its reply limit",
    gated: "the assistant is paused",
    off: "the assistant is off",
    bad_tool_call: "the assistant could not complete the step",
    tool_unavailable: "that step is not available yet",
    unknown_service: "the service asked about is not one the assistant can handle",
    not_sellable: "that service is not bookable online",
    inquiry_only: "that service is confirmed by a person",
    payment_unavailable: "online payment was not possible",
    money_off: "online payment is off",
  },
  es: {
    unsure: "el asistente no estaba seguro",
    human_requested: "el cliente pidió hablar con una persona",
    turn_ceiling: "el asistente llegó a su límite de respuestas",
    gated: "el asistente está en pausa",
    off: "el asistente está apagado",
    bad_tool_call: "el asistente no pudo completar el paso",
    tool_unavailable: "ese paso aún no está disponible",
    unknown_service: "el servicio consultado no es uno que el asistente pueda atender",
    not_sellable: "ese servicio no se reserva en línea",
    inquiry_only: "ese servicio lo confirma una persona",
    payment_unavailable: "no fue posible el pago en línea",
    money_off: "el pago en línea está apagado",
  },
};

/**
 * The line a team member reads at the top of the handoff. Deterministic, ES/EN.
 * `locale` is the language of the person reading it (the workspace), which may differ from
 * the guest's.
 */
export function teamHandoffNote(ctx: HandoffContext, locale: BookingAssistantLocale): string {
  const es = locale === "es";
  const parts: string[] = [
    es ? `${bookingAssistantDisclosureLabel("es")}: pasa a una persona porque ${WHY.es[ctx.reason]}.` : `${bookingAssistantDisclosureLabel("en")}: handed to a person because ${WHY.en[ctx.reason]}.`,
  ];
  if (ctx.guestAsked) parts.push(es ? `El cliente escribió: "${ctx.guestAsked}"` : `The guest wrote: "${ctx.guestAsked}"`);
  if (ctx.serviceTitle) parts.push(es ? `Servicio: ${ctx.serviceTitle}.` : `Service: ${ctx.serviceTitle}.`);
  if (ctx.shown?.kind === "quote") parts.push(es ? `Ya se le mostró un precio: ${ctx.shown.priceLabel}.` : `They were already shown a price: ${ctx.shown.priceLabel}.`);
  if (ctx.shown?.kind === "times") parts.push(es ? `Ya se le mostraron ${ctx.shown.count} horarios libres.` : `They were already shown ${ctx.shown.count} open times.`);
  return parts.join(" ");
}

/** The guest-facing handoff line for a context (existing copy; new reasons read as "unsure"). */
export function guestHandoffText(ctx: HandoffContext): string {
  const known: BookingHandoffReason =
    ctx.reason === "unsure" || ctx.reason === "human_requested" || ctx.reason === "turn_ceiling" || ctx.reason === "gated" || ctx.reason === "off"
      ? ctx.reason
      : "unsure";
  return bookingAssistantHandoffCopy(known, ctx.locale);
}
