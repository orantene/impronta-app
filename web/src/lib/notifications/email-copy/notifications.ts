/**
 * Notifications email copy fragment (EN + ES). Aggregated by `../email-copy.ts`.
 *
 * Covers the shared notification frame templates in `emails/notifications/`:
 *  - DayOfReminder.tsx  → catalog templateIds `client.booking_day_of_reminder`
 *    and `talent.booking_day_of_reminder` (one shared template, identical copy).
 *  - InquiryCancelled.tsx → catalog templateId `inquiry.cancelled`.
 *  - Digest.tsx → rendered by the digest sweep (digest.ts) + the `message.new`
 *    catalog fallback, NOT dispatched with its own static templateId. The
 *    batch heading/intro/CTA are computed per-batch and passed in as props;
 *    only the in-template greeting frame is localized here, under the stable
 *    key "notifications.digest".
 *
 * `NOTIF_ES: typeof NOTIF_EN` enforces key + shape parity at build time. No
 * `as const` — values stay `string` so ES can hold different words. Spanish is
 * natural Mexican Spanish using "tú". Dynamic values use `{var}` placeholders
 * mirroring each template's payload keys.
 */

export const NOTIF_EN = {
  // DayOfReminder.tsx — client surface. Identical copy on the talent surface.
  "client.booking_day_of_reminder": {
    subject: "Reminder: your event is tomorrow",
    preview: "Reminder: your event is tomorrow",
    heading: "Your event is tomorrow",
    intro: "Hi {name}, this is a reminder that you have a booking tomorrow. Here are the details:",
    note: "Open the inquiry for the full schedule, location, and any final notes.",
    button: "View details →",
    dateLabel: "Date",
    locationLabel: "Location",
  },
  // DayOfReminder.tsx — talent surface (same shared template + copy).
  "talent.booking_day_of_reminder": {
    subject: "Reminder: your event is tomorrow",
    preview: "Reminder: your event is tomorrow",
    heading: "Your event is tomorrow",
    intro: "Hi {name}, this is a reminder that you have a booking tomorrow. Here are the details:",
    note: "Open the inquiry for the full schedule, location, and any final notes.",
    button: "View details →",
    dateLabel: "Date",
    locationLabel: "Location",
  },
  // InquiryCancelled.tsx
  "inquiry.cancelled": {
    subject: "An inquiry has been cancelled",
    preview: "An inquiry has been cancelled",
    heading: "Inquiry cancelled",
    intro: "Hi {name}, {event} has been cancelled. No further action is needed.",
    note: "You can review the details any time.",
    button: "View details →",
    dateLabel: "Date",
    locationLabel: "Location",
  },
  // Digest.tsx — only the in-template greeting frame; heading/intro/CTA are
  // per-batch props supplied by the digest sweep (digest.ts).
  "notifications.digest": {
    subject: "You have new notifications",
    greeting: "Hi {name}, {intro}",
  },
};

export const NOTIF_ES: typeof NOTIF_EN = {
  "client.booking_day_of_reminder": {
    subject: "Recordatorio: tu evento es mañana",
    preview: "Recordatorio: tu evento es mañana",
    heading: "Tu evento es mañana",
    intro: "Hola {name}, te recordamos que tienes una reservación mañana. Estos son los detalles:",
    note: "Abre la solicitud para ver el itinerario completo, la ubicación y cualquier nota final.",
    button: "Ver detalles →",
    dateLabel: "Fecha",
    locationLabel: "Ubicación",
  },
  "talent.booking_day_of_reminder": {
    subject: "Recordatorio: tu evento es mañana",
    preview: "Recordatorio: tu evento es mañana",
    heading: "Tu evento es mañana",
    intro: "Hola {name}, te recordamos que tienes una reservación mañana. Estos son los detalles:",
    note: "Abre la solicitud para ver el itinerario completo, la ubicación y cualquier nota final.",
    button: "Ver detalles →",
    dateLabel: "Fecha",
    locationLabel: "Ubicación",
  },
  "inquiry.cancelled": {
    subject: "Se canceló una solicitud",
    preview: "Se canceló una solicitud",
    heading: "Solicitud cancelada",
    intro: "Hola {name}, {event} se canceló. No necesitas hacer nada más.",
    note: "Puedes revisar los detalles cuando quieras.",
    button: "Ver detalles →",
    dateLabel: "Fecha",
    locationLabel: "Ubicación",
  },
  "notifications.digest": {
    subject: "Tienes nuevas notificaciones",
    greeting: "Hola {name}, {intro}",
  },
};
