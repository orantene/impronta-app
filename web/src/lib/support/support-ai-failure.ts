import { SUPPORT_AGENT } from "@/lib/support/support-persona";

/**
 * TUL-660: an AI error must never escalate on its own. The requester gets an
 * explicit choice: send the message again (retry) or ask for a person.
 * Escalation happens only when they tap "Talk to a human" (or leave an email).
 */
export function supportAiErrorBody(locale: string | null | undefined): string {
  const es = (locale ?? "").toLowerCase().startsWith("es");
  return es
    ? `No pude responder ahora. Puedes volver a enviar tu mensaje o pedir que ${SUPPORT_AGENT.name} lo revise.`
    : `I couldn't answer just now. You can send your message again, or ask for ${SUPPORT_AGENT.name} to take a look.`;
}

export const SUPPORT_AI_ERROR_CARD = { kind: "offer-human", reason: "ai_error", retry: true } as const;

/** Card payload for the error offer; description carries the localized sentence. */
export function supportAiErrorCard(locale: string | null | undefined) {
  return { ...SUPPORT_AI_ERROR_CARD, description: supportAiErrorBody(locale) };
}

/**
 * TUL-660: reasons the AI may raise on its own. These only OFFER a person (card,
 * the requester taps); they never hand the ticket over silently. Deadline-bound
 * subject reasons (dispute, safety, legal) still escalate immediately.
 */
const OFFER_FIRST_REASONS: ReadonlySet<string> = new Set([
  "ai_low_confidence",
  "ai_sentiment",
  "ai_suggested",
  "billing",
  "refund",
]);

export function shouldOfferHumanInsteadOfEscalating(reason: string): boolean {
  return OFFER_FIRST_REASONS.has(reason);
}
