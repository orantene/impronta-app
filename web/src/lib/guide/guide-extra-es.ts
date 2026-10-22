/**
 * Spanish copy for Guide nodes that are defined in code (adhoc-nodes.ts) and
 * not yet in the `dashboard.adminHelp.*` message catalog. `guide-i18n.ts`
 * uses it as the Spanish fallback, so a catalog key added later still wins.
 * One entry per node id.
 */
export type GuideExtraEs = { title: string; purpose: string; steps: readonly string[] };

export const GUIDE_EXTRA_ES: Readonly<Record<string, GuideExtraEs>> = {
  "talent-schedule-hours": {
    title: "Horario y disponibilidad",
    purpose:
      "Tu horario son los días y las horas en que te pueden reservar; los clientes solo ven espacios dentro de él, así que defínelo una vez y mantenlo al día.",
    steps: [
      "Abre Disponibilidad y define las horas en que trabajas cada día de la semana",
      "Bloquea fechas por viajes, feriados o descanso para que nadie pueda reservarlas",
      "Revisa tu calendario antes de aceptar una solicitud y cambia tu horario cuando cambie tu semana",
    ],
  },
};

/** Guide titles for talent-facing nodes that have no catalog label or registry short title (TUL-602). */
export const GUIDE_TITLES_ES: Readonly<Record<string, string>> = {
  "talent-today-pulse": "Tu día de un vistazo",
  "talent-booking-detail": "Detalle de la reserva",
  "talent-limits": "Tus límites",
  "talent-travel": "Viajes",
  "talent-links": "Tus enlaces",
  "talent-reviews": "Reseñas",
  "talent-documents": "Documentos",
  "talent-media-kit": "Kit de prensa",
  "talent-notifications": "Tus notificaciones",
  "talent-voice-reply": "Respuesta de voz",
  "talent-chat-archive": "Chats archivados",
  "talent-share-card": "Tarjeta para compartir",
  "payout-method-failure": "Falla en tu método de cobro",
  "subscription-lifecycle": "Ciclo de tu suscripción",
  "notification-detail": "Detalle de una notificación",
  "support-ticket": "Tu ticket de soporte",
};

export const GUIDE_TITLES_EN: Readonly<Record<string, string>> = {
  "talent-today-pulse": "Your day at a glance",
  "talent-booking-detail": "Booking details",
  "talent-limits": "Your limits",
  "talent-travel": "Travel",
  "talent-links": "Your links",
  "talent-reviews": "Reviews",
  "talent-documents": "Documents",
  "talent-media-kit": "Media kit",
  "talent-notifications": "Your notifications",
  "talent-voice-reply": "Voice reply",
  "talent-chat-archive": "Archived chats",
  "talent-share-card": "Share card",
  "payout-method-failure": "Payout method problem",
  "subscription-lifecycle": "Your subscription",
  "notification-detail": "Notification details",
  "support-ticket": "Your support ticket",
};

/** Spanish purpose and steps for the support-ticket node, which the catalog lacks. */
export const SUPPORT_TICKET_ES = {
  purpose: "Tu conversación con el soporte de Tulala. Cada ticket queda ligado a este espacio y a tu usuario.",
  steps: [
    "Lee la conversación completa, incluidas las actualizaciones del sistema",
    "Responde para que soporte pueda seguir ayudándote",
    "Califica la solución cuando el ticket se marque como resuelto",
  ],
} as const;
