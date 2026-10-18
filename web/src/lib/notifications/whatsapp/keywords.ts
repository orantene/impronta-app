/**
 * TUL-225: the words a person sends back to stop WhatsApp messages (design 4.4). Matched on the
 * WHOLE message, accent- and case-insensitive: "no gracias, pero a las 5 me va bien" is a reply,
 * not an opt-out. No server-only import so the rule is testable on its own.
 */
export type InboundKeyword = "stop" | "help";

const STOP_WORDS = new Set(["stop", "stop notifications", "stopall", "baja", "cancelar", "parar", "detener", "unsubscribe", "no"]);
const HELP_WORDS = new Set(["help", "ayuda"]);

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s.!?¡¿,;:]+/g, " ")
    .trim();
}

export function classifyInboundKeyword(text: string | null | undefined): InboundKeyword | null {
  if (!text) return null;
  const word = normalize(text);
  if (STOP_WORDS.has(word)) return "stop";
  if (HELP_WORDS.has(word)) return "help";
  return null;
}

/** Twilio sends `whatsapp:+5219981234567`; only a valid E.164 number is a number we can act on. */
export function e164FromWhatsAppAddress(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  const number = v.toLowerCase().startsWith("whatsapp:") ? v.slice("whatsapp:".length).trim() : v;
  return /^\+[1-9]\d{6,14}$/.test(number) ? number : null;
}

/** One short confirmation in both languages: we do not know the sender's language from a keyword. */
export const STOP_REPLY = "Listo, ya no te enviaremos avisos por WhatsApp. / Done, we will not send you WhatsApp messages. Ajustes / Settings > Notificaciones.";
export const HELP_REPLY = "Tulala: avisos de consultas y reservas. Responde BAJA para dejar de recibirlos, o cámbialo en Ajustes. / Reply STOP to opt out, or change it in Settings.";
