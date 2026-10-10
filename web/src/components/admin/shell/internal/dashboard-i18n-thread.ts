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
};
