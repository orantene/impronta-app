/**
 * Inquiry form sheet copy (WSF PR D). EN + ES (tú). Kept beside the sheet
 * rather than in messages/*.json so this PR does not collide with the
 * guest-chat keys other open PRs are adding there.
 */
import { pickLocale } from "@/lib/i18n/pick-locale";

const COPY = {
  title: { en: "Send a message to {name}", es: "Envía un mensaje a {name}" },
  about: { en: "About", es: "Sobre" },
  name: { en: "Your name", es: "Tu nombre" },
  email: { en: "Your email", es: "Tu email" },
  message: { en: "Message", es: "Mensaje" },
  messageHint: {
    en: "What would you like to know? Dates and details help.",
    es: "¿Qué quieres saber? Las fechas y los detalles ayudan.",
  },
  send: { en: "Send message", es: "Enviar mensaje" },
  sending: { en: "Sending…", es: "Enviando…" },
  close: { en: "Close", es: "Cerrar" },
  errName: { en: "Add your name.", es: "Escribe tu nombre." },
  errEmail: { en: "Add a valid email.", es: "Escribe un email válido." },
  errMessage: { en: "Write a message.", es: "Escribe un mensaje." },
  failed: {
    en: "Your message was not sent. Nothing was lost, try again.",
    es: "Tu mensaje no se envió. No se perdió nada, inténtalo de nuevo.",
  },
  retry: { en: "Try again", es: "Intentar de nuevo" },
  sentTitle: { en: "Message sent", es: "Mensaje enviado" },
  sentBody: {
    en: "{name} has your message. The reply will reach you at {email}.",
    es: "{name} ya tiene tu mensaje. La respuesta te llegará a {email}.",
  },
  done: { en: "Done", es: "Listo" },
  removeService: { en: "Remove {title}", es: "Quitar {title}" },
} as const;

export type InquiryFormCopyKey = keyof typeof COPY;

export function inquiryFormCopy(
  locale: string,
  key: InquiryFormCopyKey,
  vars: Record<string, string> = {},
): string {
  return pickLocale(locale, COPY[key]).replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");
}
