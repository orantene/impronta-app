/**
 * TUL-36 phase 1: handoff copy when the booking assistant stops (unsure,
 * human ask, turn ceiling, spend gate). No book / pay tools in this slice.
 */

export type BookingAssistantLocale = "en" | "es";

export function normalizeBookingAssistantLocale(raw: string | null | undefined): BookingAssistantLocale {
  return (raw ?? "").toLowerCase().startsWith("es") ? "es" : "en";
}

const ES_WORDS = new Set([
  "hola", "quiero", "cuanto", "cuánto", "cuesta", "precio", "tienes", "tienen", "puedo",
  "gracias", "para", "por", "que", "qué", "como", "cómo", "cuando", "cuándo", "donde",
  "dónde", "el", "la", "los", "las", "una", "un", "es", "esta", "está", "hay", "mi",
  "tu", "con", "pero", "si", "sí", "buenas", "buenos", "dias", "días", "horario",
]);
const EN_WORDS = new Set([
  "hi", "hello", "how", "much", "what", "when", "where", "is", "are", "the", "a", "an",
  "do", "does", "you", "your", "can", "i", "my", "price", "cost", "have", "thanks",
  "thank", "please", "for", "with", "available", "about", "and", "of", "to",
]);

/**
 * TUL-1154: the page/inquiry locale is a fallback, not the reply language. An
 * English guest on a Spanish site got Spanish. Detect the language of what the
 * guest actually wrote; null when the message is too short or mixed to tell.
 */
export function detectGuestMessageLocale(text: string | null | undefined): BookingAssistantLocale | null {
  const lower = (text ?? "").toLowerCase();
  const words = lower.match(/[a-záéíóúñü]+/g) ?? [];
  let es = /[ñ¿¡áéíóú]/.test(lower) ? 2 : 0;
  let en = 0;
  for (const w of words) {
    if (ES_WORDS.has(w)) es += 1;
    if (EN_WORDS.has(w)) en += 1;
  }
  if (es >= 2 && es > en) return "es";
  if (en >= 2 && en > es) return "en";
  return null;
}

/** Guest's own language wins; the page/inquiry locale breaks ties. */
export function resolveBookingAssistantReplyLocale(
  guestMessage: string | null | undefined,
  pageLocale: string | null | undefined,
): BookingAssistantLocale {
  return detectGuestMessageLocale(guestMessage) ?? normalizeBookingAssistantLocale(pageLocale);
}

/** The explicit language line sent to the model (TUL-1154): a Spanish catalog must not pull an English guest into Spanish. */
export function replyLanguageDirective(locale: BookingAssistantLocale): string {
  return locale === "es"
    ? "REPLY_LANGUAGE=Spanish (the guest wrote in Spanish). Write the whole reply in Spanish."
    : "REPLY_LANGUAGE=English (the guest wrote in English, even though the catalog below may be in Spanish). Write the whole reply in English and translate catalog titles if needed.";
}

/**
 * TUL-1154: true when the guest's message is clearly in one language and the
 * model's reply is clearly in the other. The caller sends the handoff copy in
 * the guest's language instead of a reply they cannot read.
 */
export function replyLanguageMismatch(
  guestMessage: string | null | undefined,
  replyText: string | null | undefined,
): boolean {
  const guest = detectGuestMessageLocale(guestMessage);
  const reply = detectGuestMessageLocale(replyText);
  return guest !== null && reply !== null && guest !== reply;
}

const HANDOFF: Record<BookingAssistantLocale, string> = {
  en: "A person on the team will take it from here and reply in this chat.",
  es: "Una persona del equipo lo toma desde aquí y te responde en este chat.",
};

const CEILING: Record<BookingAssistantLocale, string> = {
  en: "I am passing you to the team so they can finish helping you here.",
  es: "Te paso con el equipo para que te ayuden a terminar aquí.",
};

const GATED: Record<BookingAssistantLocale, string> = {
  en: "The assistant is paused for now. The team will reply in this chat.",
  es: "El asistente está en pausa por ahora. El equipo te responde en este chat.",
};

/**
 * TUL-1155: after a handoff the canned handoff copy is never posted twice. When
 * the assistant cannot answer a later message, the guest still gets a short,
 * different acknowledgement instead of silence.
 */
const FOLLOW_UP_ACK: Record<BookingAssistantLocale, string> = {
  en: "Got your message. The team has it and will reply here.",
  es: "Recibimos tu mensaje. El equipo ya lo tiene y te responde aquí.",
};

export function bookingAssistantFollowUpAckCopy(locale: BookingAssistantLocale): string {
  return FOLLOW_UP_ACK[locale];
}

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
