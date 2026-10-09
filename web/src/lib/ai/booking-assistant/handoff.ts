/**
 * TUL-36 phase 1: handoff copy when the booking assistant stops (unsure,
 * human ask, turn ceiling, spend gate). No book / pay tools in this slice.
 */

export type BookingAssistantLocale = "en" | "es";

export function normalizeBookingAssistantLocale(raw: string | null | undefined): BookingAssistantLocale {
  return (raw ?? "").toLowerCase().startsWith("es") ? "es" : "en";
}

const HANDOFF: Record<BookingAssistantLocale, string> = {
  en: "A person on the team will take it from here and reply in this chat.",
  es: "Una persona del equipo lo toma desde aqui y te responde en este chat.",
};

const CEILING: Record<BookingAssistantLocale, string> = {
  en: "I am passing you to the team so they can finish helping you here.",
  es: "Te paso con el equipo para que te ayuden a terminar aqui.",
};

const GATED: Record<BookingAssistantLocale, string> = {
  en: "The assistant is paused for now. The team will reply in this chat.",
  es: "El asistente esta en pausa por ahora. El equipo te responde en este chat.",
};

export type BookingHandoffReason = "unsure" | "human_requested" | "turn_ceiling" | "gated" | "off";

export function bookingAssistantHandoffCopy(
  reason: BookingHandoffReason,
  locale: BookingAssistantLocale,
): string {
  if (reason === "turn_ceiling") return CEILING[locale];
  if (reason === "gated" || reason === "off") return GATED[locale];
  return HANDOFF[locale];
}

/** Guest + talent thread disclosure label (not body text). PM: Automated reply. */
const DISCLOSURE: Record<BookingAssistantLocale, string> = {
  en: "Automated reply",
  es: "Respuesta automática",
};

export function bookingAssistantDisclosureLabel(locale: BookingAssistantLocale): string {
  return DISCLOSURE[locale];
}

/** Cheap prefilter: guest asked for a human before we spend a model call. */
const HUMAN_EN =
  /\b(talk to (a )?(human|person|someone)|real person|actual person|human please|speak (to|with) (someone|a human|the talent)|message (the )?(talent|owner|stylist))\b/i;
const HUMAN_ES =
  /\b(hablar con (un |una )?(humano|humana|persona|alguien)|persona real|quiero (hablar|escribir) (con |a )?(la |el )?(persona|talento|estilista)|pasame (con |a )?(una )?persona)\b/i;

export function wantsHumanBookingHelp(message: string | null | undefined): boolean {
  const text = (message ?? "").trim();
  if (!text) return false;
  return HUMAN_EN.test(text) || HUMAN_ES.test(text);
}
