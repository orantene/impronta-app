import { resolveAiChatAdapter } from "@/lib/ai/resolve-provider";

export type InquiryDraftAction = "generate" | "polish";

export type InquiryDraftModelInput = {
  action: InquiryDraftAction;
  locale: "en" | "es";
  talentNames: string[];
  rawQuery: string;
  eventLocation: string;
  eventDate: string;
  quantity: string;
  currentMessage: string;
};

const DEFAULT_CHAT_MODEL_FALLBACK = "gpt-4o-mini";

function systemPrompt(locale: "en" | "es"): string {
  if (locale === "es") {
    return [
      "Eres un asistente para redactar consultas breves y profesionales a una agencia de talentos.",
      "El usuario contacta a la agencia (no al talento directamente).",
      "No inventes datos de contacto, fechas exactas ni presupuestos que el usuario no haya indicado.",
      "No afirmes disponibilidad del talento, precios, reembolsos ni reservas confirmadas — la agencia lo confirma.",
      "Usa solo la información proporcionada en el contexto. Sé conciso (unos 3–8 frases).",
      "Devuelve únicamente el texto del mensaje, sin títulos ni comillas envolventes.",
    ].join(" ");
  }
  return [
    "You help write short, professional inquiry messages to a talent agency.",
    "The user is contacting the agency (not talent directly).",
    "Do not invent contact details, exact dates, or budgets the user did not provide.",
    "Never state talent availability, pricing, refunds, or booking guarantees — the agency confirms those.",
    "Use only information from the context. Be concise (about 3–8 sentences).",
    "Return only the message body text — no headings or surrounding quotes.",
  ].join(" ");
}

function userPayload(input: InquiryDraftModelInput): string {
  const lines: string[] = [];
  lines.push(`Action: ${input.action}`);
  if (input.talentNames.length) {
    lines.push(`Talent of interest (names): ${input.talentNames.join(", ")}`);
  }
  if (input.rawQuery.trim()) {
    lines.push(`What they are looking for (from form): ${input.rawQuery.trim()}`);
  }
  if (input.eventLocation.trim()) {
    lines.push(`Event / shoot location: ${input.eventLocation.trim()}`);
  }
  if (input.eventDate.trim()) {
    lines.push(`Date hint: ${input.eventDate.trim()}`);
  }
  if (input.quantity.trim()) {
    lines.push(`Quantity: ${input.quantity.trim()}`);
  }
  if (input.action === "polish" && input.currentMessage.trim()) {
    lines.push("Current draft to improve (keep facts; fix clarity and tone):");
    lines.push(input.currentMessage.trim());
  }
  return lines.join("\n");
}

/**
 * Server-only: chat completion for inquiry draft via configured AI provider.
 */
export async function completeInquiryDraft(
  input: InquiryDraftModelInput,
): Promise<string | null> {
  if (input.action === "polish" && !input.currentMessage.trim()) {
    return null;
  }

  const adapter = await resolveAiChatAdapter();
  const result = await adapter.chatCompletion({
    systemPrompt: systemPrompt(input.locale),
    userMessage: userPayload(input),
    temperature: 0.3,
    maxTokens: 520,
  });

  if (!result.ok) return null;
  const text = result.text.trim();
  if (!text) return null;
  return text.slice(0, 4800);
}

export const INQUIRY_DRAFT_DEFAULT_MODEL_LABEL = DEFAULT_CHAT_MODEL_FALLBACK;
