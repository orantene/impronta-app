/**
 * Talent email copy fragment (EN + ES). Aggregated by `../email-copy.ts`.
 *
 * `TALENT_ES: typeof TALENT_EN` enforces key + shape parity at build time. No
 * `as const` — values stay `string` so ES can hold different words.
 *
 * Keys are the catalog `templateId` for each talent-facing template. Each entry
 * holds only the fields its template renders. `{name}` = recipient name,
 * `{brand}` = agency/account name; other placeholders mirror the payload keys.
 */

export const TALENT_EN = {
  // account.talent_welcome — emails/talent/Welcome.tsx
  "account.talent_welcome": {
    subject: "Welcome to Tulala",
    preview: "Welcome to Tulala",
    heading: "Welcome to Tulala",
    fallbackName: "there",
    intro:
      "Welcome, {name}. Your profile is live. You can now manage bookings, respond to inquiries, and keep your portfolio current.",
    note: "Tip: complete your profile photos and bio so you stand out to clients.",
    button: "Go to my dashboard →",
  },

  // talent.profile_approved — emails/talent/ProfileApproved.tsx
  "talent.profile_approved": {
    subject: "Your profile is approved",
    preview: "Your profile is approved",
    heading: "Your profile is approved",
    fallbackName: "there",
    intro:
      "Hi {name}, your profile has been reviewed and approved. It's now visible and discoverable to clients.",
    note: "Keep your availability and portfolio up to date so clients always see your best work.",
    button: "View my profile →",
  },

  // talent.claim_invite — emails/talent/ClaimInvite.tsx
  "talent.claim_invite": {
    subject: "Claim your profile on Tulala",
    preview: "Claim your profile on {brand}",
    fallbackName: "there",
    greeting: "Hi {name},",
    heading: "Claim your profile on {brand}",
    intro:
      "{brand} added you to their roster. Claim your profile to manage bookings, reply to inquiries, and edit your photos and bio.",
    expires: "Link expires {expiresLabel}.",
    button: "Claim profile →",
  },

  // talent.inquiry_invited — emails/talent/InquiryInvited.tsx
  "talent.inquiry_invited": {
    subject: "You've been added to an inquiry",
    preview: "You've been added to an inquiry",
    heading: "You've been added to an inquiry",
    fallbackName: "there",
    fallbackEvent: "a new inquiry",
    intro: "Hi {name}, the agency has added you to {event}.",
    labelDate: "Date",
    labelLocation: "Location",
    note: "You'll be notified when an offer is ready for your review. Log in to see the full details.",
    button: "View inquiry →",
  },

  // talent.offer_ready — emails/talent/OfferReady.tsx
  "talent.offer_ready": {
    subject: "You have an offer to review",
    preview: "You have an offer to review",
    heading: "You have an offer to review",
    fallbackName: "there",
    fallbackEvent: "a booking",
    intro: "Hi {name}, an offer for {event} is ready for your review. Here's your rate and the details.",
    labelAmount: "Your rate",
    labelDate: "Date",
    labelLocation: "Location",
    note: "Open the offer to approve or ask a question. Your rate is what you'll be paid for this booking.",
    button: "Review offer →",
  },

  // talent.booking_confirmed — emails/talent/BookingConfirmed.tsx
  "talent.booking_confirmed": {
    subject: "Booking confirmed",
    preview: "Booking confirmed",
    heading: "Booking confirmed",
    fallbackName: "there",
    fallbackEvent: "your booking",
    intro: "Hi {name}, {event} has been confirmed.",
    labelDate: "Date",
    labelLocation: "Location",
    note: "You're confirmed for this event. The coordinator will share any additional details.",
    button: "View my inquiries →",
  },

  // roster.join_approved — emails/talent/JoinApproved.tsx
  "roster.join_approved": {
    subject: "You're on the roster",
    preview: "You're on {team}",
    heading: "You're on the roster",
    fallbackName: "there",
    fallbackTeam: "the roster",
    intro:
      "Hi {name}, your request to join {team} was approved. Open your dashboard to keep your photos, rates, and availability up to date.",
    button: "Go to my dashboard →",
  },

  // roster.join_rejected — emails/talent/JoinDeclined.tsx
  "roster.join_rejected": {
    subject: "Update on your roster request",
    preview: "Update on your roster request",
    heading: "Update on your request",
    fallbackName: "there",
    fallbackTeam: "this workspace",
    intro:
      "Hi {name}, {team} isn't able to add you to their roster right now. Your profile stays live — you can keep it polished and explore other workspaces open for registration.",
    button: "Explore workspaces →",
  },

  // talent.payout_settled — emails/talent/PayoutSettled.tsx
  "talent.payout_settled": {
    subject: "Your payout is on its way",
    preview: "Your payout is on its way",
    heading: "Your payout is on its way",
    fallbackName: "there",
    fallbackEvent: "your booking",
    intro: "Hi {name}, your payout for {event} has been settled.",
    labelAmount: "Amount",
    note: "Track this and past payouts from your payout settings.",
    button: "View payouts →",
  },

  // talent.payout_reversed — emails/talent/PayoutReversed.tsx.
  // The catalog hands the template an English `reasonClause`; `reasonDispute` /
  // `reasonRefund` re-localize the two known clauses, with `{reason}` as the
  // passthrough fallback for anything else.
  "talent.payout_reversed": {
    subject: "A payout was reversed",
    preview: "A payout was reversed",
    heading: "A payout was reversed",
    fallbackName: "there",
    reasonDispute: "the client's payment was disputed",
    reasonRefund: "the client's payment was refunded",
    intro:
      "Hi {name}, a payout was reversed because {reason}. If you think this is a mistake, contact your coordinator.",
    labelAmountReversed: "Amount reversed",
    note: "Your earnings dashboard always shows your current payout status.",
    button: "View payouts →",
  },
};

export const TALENT_ES: typeof TALENT_EN = {
  "account.talent_welcome": {
    subject: "Te damos la bienvenida a Tulala",
    preview: "Te damos la bienvenida a Tulala",
    heading: "Te damos la bienvenida a Tulala",
    fallbackName: "hola",
    intro:
      "Hola, {name}. Tu perfil ya está activo. Ahora puedes gestionar reservas, responder solicitudes y mantener tu portafolio al día.",
    note: "Consejo: completa las fotos de tu perfil y tu biografía para destacar ante los clientes.",
    button: "Ir a mi panel →",
  },

  "talent.profile_approved": {
    subject: "Tu perfil fue aprobado",
    preview: "Tu perfil fue aprobado",
    heading: "Tu perfil fue aprobado",
    fallbackName: "hola",
    intro:
      "Hola {name}, tu perfil fue revisado y aprobado. Ya es visible y los clientes pueden encontrarlo.",
    note: "Mantén tu disponibilidad y tu portafolio al día para que los clientes siempre vean tu mejor trabajo.",
    button: "Ver mi perfil →",
  },

  "talent.claim_invite": {
    subject: "Reclama tu perfil en Tulala",
    preview: "Reclama tu perfil en {brand}",
    fallbackName: "hola",
    greeting: "Hola {name},",
    heading: "Reclama tu perfil en {brand}",
    intro:
      "{brand} te agregó a su roster. Reclama tu perfil para gestionar reservas, responder solicitudes y editar tus fotos y tu biografía.",
    expires: "El enlace caduca el {expiresLabel}.",
    button: "Reclamar perfil →",
  },

  "talent.inquiry_invited": {
    subject: "Te agregaron a una solicitud",
    preview: "Te agregaron a una solicitud",
    heading: "Te agregaron a una solicitud",
    fallbackName: "hola",
    fallbackEvent: "una nueva solicitud",
    intro: "Hola {name}, la agencia te agregó a {event}.",
    labelDate: "Fecha",
    labelLocation: "Ubicación",
    note: "Te avisaremos cuando haya una oferta lista para tu revisión. Inicia sesión para ver todos los detalles.",
    button: "Ver solicitud →",
  },

  "talent.offer_ready": {
    subject: "Tienes una oferta para revisar",
    preview: "Tienes una oferta para revisar",
    heading: "Tienes una oferta para revisar",
    fallbackName: "hola",
    fallbackEvent: "una reserva",
    intro: "Hola {name}, una oferta para {event} está lista para tu revisión. Aquí tienes tu tarifa y los detalles.",
    labelAmount: "Tu tarifa",
    labelDate: "Fecha",
    labelLocation: "Ubicación",
    note: "Abre la oferta para aprobarla o hacer una pregunta. Tu tarifa es lo que recibirás por esta reserva.",
    button: "Revisar oferta →",
  },

  "talent.booking_confirmed": {
    subject: "Reserva confirmada",
    preview: "Reserva confirmada",
    heading: "Reserva confirmada",
    fallbackName: "hola",
    fallbackEvent: "tu reserva",
    intro: "Hola {name}, {event} fue confirmada.",
    labelDate: "Fecha",
    labelLocation: "Ubicación",
    note: "Estás confirmado para este evento. El coordinador compartirá cualquier detalle adicional.",
    button: "Ver mis solicitudes →",
  },

  "roster.join_approved": {
    subject: "Ya estás en el roster",
    preview: "Ya estás en {team}",
    heading: "Ya estás en el roster",
    fallbackName: "hola",
    fallbackTeam: "el roster",
    intro:
      "Hola {name}, tu solicitud para unirte a {team} fue aprobada. Abre tu panel para mantener tus fotos, tarifas y disponibilidad al día.",
    button: "Ir a mi panel →",
  },

  "roster.join_rejected": {
    subject: "Actualización sobre tu solicitud de roster",
    preview: "Actualización sobre tu solicitud de roster",
    heading: "Actualización sobre tu solicitud",
    fallbackName: "hola",
    fallbackTeam: "este espacio de trabajo",
    intro:
      "Hola {name}, {team} no puede agregarte a su roster por ahora. Tu perfil sigue activo — puedes mantenerlo pulido y explorar otros espacios de trabajo abiertos a registro.",
    button: "Explorar espacios de trabajo →",
  },

  "talent.payout_settled": {
    subject: "Tu pago va en camino",
    preview: "Tu pago va en camino",
    heading: "Tu pago va en camino",
    fallbackName: "hola",
    fallbackEvent: "tu reserva",
    intro: "Hola {name}, tu pago por {event} fue liquidado.",
    labelAmount: "Monto",
    note: "Consulta este y tus pagos anteriores desde la configuración de pagos.",
    button: "Ver pagos →",
  },

  "talent.payout_reversed": {
    subject: "Se revirtió un pago",
    preview: "Se revirtió un pago",
    heading: "Se revirtió un pago",
    fallbackName: "hola",
    reasonDispute: "el cliente disputó su pago",
    reasonRefund: "se reembolsó el pago del cliente",
    intro:
      "Hola {name}, se revirtió un pago porque {reason}. Si crees que es un error, comunícate con tu coordinador.",
    labelAmountReversed: "Monto revertido",
    note: "Tu panel de ganancias siempre muestra el estado actual de tus pagos.",
    button: "Ver pagos →",
  },
};
