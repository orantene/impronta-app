/**
 * Spanish for the participant thread on an admin inquiry
 * (_ParticipantThreadShell): empty state, composer placeholder, Send, and the
 * unknown-sender fallback. Keyed by the English literal like every dashboard
 * catalog; kept out of dashboard-i18n.ts, which sits on the size ratchet.
 */
export const THREAD_ES_TEXT: Record<string, string> = {
  "No messages yet. Send the first message below.": "Aún no hay mensajes. Envía el primero abajo.",
  "Write a message...": "Escribe un mensaje...",
  Send: "Enviar",
  Unknown: "Desconocido",
  // Talent inbox Activity / Chat empty states (TUL-519 cards 379+500).
  "No activity yet": "Aún no hay actividad",
  "Offers, payments and booking confirmations will appear here as the job progresses.":
    "Las ofertas, pagos y confirmaciones de reserva aparecerán aquí conforme avance el trabajo.",
  "Start the conversation below. Your message will go to the right people in this thread.":
    "Empieza la conversación abajo. Tu mensaje llegará a las personas correctas de este hilo.",
  "Offer sent": "Oferta enviada",
  // Thread chrome leftovers (TUL-536 / TUL-500). "Loading…" lives in the
  // inline dashboard-i18n.ts table (Cargando...).
  "No offer yet": "Aún no hay oferta",
  // Apostrophe / "it is" alias so a paraphrased key still resolves.
  "No offer yet. Your coordinator will send one when it is ready.":
    "Aún no hay oferta. Tu coordinador enviará una cuando esté lista.",
  "No offer yet. Your coordinator will send one when it is ready":
    "Aún no hay oferta. Tu coordinador enviará una cuando esté lista.",
};
