import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";

const REASON_TEXT: Record<"en" | "es", Record<string, string>> = {
  en: {
    user_requested: "the requester asked for a person",
    ai_low_confidence: "the AI was not confident",
    ai_sentiment: "the requester seemed frustrated",
    ai_suggested: "the AI suggested a person",
    ai_unavailable: "the AI was unavailable (error or test fault)",
    staff_initiated: "a staff member took the ticket",
    billing: "billing question",
    refund: "refund question",
    dispute: "dispute",
    safety: "safety concern",
    legal: "legal matter",
  },
  es: {
    user_requested: "la persona pidió hablar con alguien",
    ai_low_confidence: "la IA no estaba segura",
    ai_sentiment: "la persona parecía frustrada",
    ai_suggested: "la IA sugirió pasar a una persona",
    ai_unavailable: "la IA no estaba disponible (error o falla de prueba)",
    staff_initiated: "una persona del equipo tomó el ticket",
    billing: "consulta de facturación",
    refund: "consulta de reembolso",
    dispute: "disputa",
    safety: "tema de seguridad",
    legal: "tema legal",
  },
};

/** Desk log line for an escalation, in the ticket's language (en + es). */
export function escalationLogLine(locale: string | null | undefined, ticketNumber: number, reason: string): string {
  const l = (locale ?? "").toLowerCase().startsWith("es") ? "es" : "en";
  const t = createTranslator(l);
  return interpolate(t("dashboard.adminSupport.escalatedLog"), {
    number: String(ticketNumber),
    reason: REASON_TEXT[l][reason] ?? reason,
  });
}
