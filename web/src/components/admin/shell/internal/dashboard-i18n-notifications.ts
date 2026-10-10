/**
 * ES copy for the notifications panel (TUL-52 D). Keys are the English strings
 * the notification catalog stores on `user_notifications` rows plus the panel's
 * own chrome. Spread into `ES_TEXT` in dashboard-i18n.ts.
 */
export const NOTIFICATIONS_ES_TEXT: Record<string, string> = {
  "You have an offer to review": "Tienes una oferta por revisar",
  "New booking confirmed": "Nueva cita confirmada",
  "A client booked a time with you.": "Un cliente reservó un horario contigo.",
  "A payment was disputed": "Se disputó un pago",
  "Payment received": "Pago recibido",
  "Deposit received": "Anticipo recibido",
  "Payment failed": "El pago falló",
  "Your payout is on its way": "Tu depósito va en camino",
  "Partial refund issued": "Reembolso parcial emitido",
  "Your trial is ending soon": "Tu prueba termina pronto",
  "Your discount ends soon": "Tu descuento termina pronto",
  "Your trial is active": "Tu prueba está activa",
  "You received a review from a client": "Recibiste una reseña de un cliente",
  "Open your Reviews page to read it in full and reply.": "Abre tu página de Reseñas para leerla completa y responder.",
  "Leave a review to share how it went. It takes about 20 seconds.": "Deja una reseña para contar cómo te fue. Toma unos 20 segundos.",
  "Your review still helps. It takes about 20 seconds.": "Tu reseña sigue ayudando. Toma unos 20 segundos.",
  "A guest requested a time.": "Un invitado pidió un horario.",
  "A guest time is confirmed.": "El horario de un invitado quedó confirmado.",
  "A held time is about to lapse.": "Un horario apartado está por vencer.",
  "A workspace asked for help.": "Un espacio de trabajo pidió ayuda.",
  // TUL-390 — popover chrome (category tabs + See all)
  "Attention": "Atención",
  "See all notifications": "Ver todas las notificaciones",
};
