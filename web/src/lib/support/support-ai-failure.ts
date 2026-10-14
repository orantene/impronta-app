import { SUPPORT_AGENT } from "@/lib/support/support-persona";

/**
 * TUL-660: an AI error must never escalate on its own. The requester gets an
 * explicit choice: send the message again (retry) or ask for a person.
 */
export function supportAiErrorBody(locale: string | null | undefined): string {
  const es = (locale ?? "").toLowerCase().startsWith("es");
  return es
    ? `No pude responder ahora. Puedes volver a enviar tu mensaje o pedir que ${SUPPORT_AGENT.name} lo revise.`
    : `I couldn't answer just now. You can send your message again, or ask for ${SUPPORT_AGENT.name} to take a look.`;
}

export const SUPPORT_AI_ERROR_CARD = { kind: "offer-human", reason: "ai_error", retry: true } as const;
