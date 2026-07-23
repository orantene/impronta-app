/**
 * Client email copy fragment (EN + ES). Aggregated by `../email-copy.ts`.
 *
 * `CLIENT_ES: typeof CLIENT_EN` enforces key + shape parity at build time. No
 * `as const` — values stay `string` so ES can hold different words.
 *
 * Keys are catalog `templateId` strings. Placeholders use `{var}` and match the
 * payload-derived values interpolated in the template (`{name}` = recipient,
 * `{brand}` = agency/account name, `{event}` = inquiry/booking label, etc.).
 */

export const CLIENT_EN = {
  "client.inquiry_received": {
    subject: "We've received your inquiry",
    preview: "We've received your inquiry",
    heading: "We've received your inquiry",
    // {name} = contact name, {brand} = agency name.
    intro:
      "Hi {name}, thanks for reaching out to {brand}. We'll get back to you as soon as possible.",
    note: "You can track the status of your inquiry from your dashboard.",
    button: "View inquiry →",
    // FieldTable row labels.
    dateLabel: "Date",
    locationLabel: "Location",
  },
  "client.reply_ready": {
    // {brand} = agency name (interpolated in the subject via subjectVars).
    subject: "{brand} replied about your inquiry",
    preview: "You have a new reply waiting",
    heading: "You have a reply",
    // {name} = contact name, {brand} = agency name.
    intro:
      "Hi {name}, {brand} just replied to your inquiry. Open the conversation to read it and keep things moving.",
    note: "This link opens the conversation you started.",
    button: "Read the reply →",
  },
  "client.offer_ready": {
    subject: "Your offer is ready",
    preview: "Your offer is ready",
    heading: "Your offer is ready",
    // {name} = client name, {event} = inquiry / contact label.
    intro: "Hi {name}, the agency has prepared an offer for {event}.",
    note: "Review the offer and accept or decline from your dashboard.",
    button: "Review offer →",
    totalLabel: "Total",
  },
  "client.booking_confirmed": {
    subject: "Booking confirmed",
    preview: "Booking confirmed",
    heading: "Booking confirmed",
    // {name} = client name, {event} = booking / contact label.
    intro: "Hi {name}, {event} has been confirmed.",
    note: "The agency will be in touch with next steps. You can view your booking from your dashboard.",
    button: "View booking →",
    dateLabel: "Date",
    locationLabel: "Location",
  },
  "client.payment_receipt": {
    subject: "Payment received",
    preview: "Payment received",
    heading: "Payment received",
    // {name} = client name, {event} = booking / contact label.
    intro: "Hi {name}, we've received your payment for {event}. Thank you.",
    note: "A copy of this receipt is always available from your dashboard.",
    button: "View receipt →",
    amountLabel: "Amount",
    dateLabel: "Date",
  },
  "client.deposit_received": {
    subject: "Deposit received — balance due",
    preview: "Deposit received — balance due to confirm your booking",
    heading: "Deposit received",
    // {name} = client name, {event} = booking / contact label, {balanceClause}
    // = " of {amount}" when the balance is known, otherwise empty.
    intro:
      "Hi {name}, we've received your deposit for {event}. To confirm the booking, pay the remaining balance{balanceClause}.",
    note: "Your booking is held — paying the balance locks it in.",
    button: "Pay balance →",
    // {balance} = computed balance amount, used to fill {balanceClause}.
    balanceClause: " of {balance}",
    depositLabel: "Deposit paid",
    balanceLabel: "Balance due",
    dateLabel: "Date",
  },
  "client.payment_refunded": {
    // Catalog drives the subject by reason; mirror its default here.
    subject: "Payment refunded",
    // heading + message are passed in as props (reason-dependent), so the
    // template renders those verbatim; these are the strings the template owns.
    // {name} = client name, {message} = the reason clause from the catalog.
    greeting: "Hi {name}, {message}",
    button: "View booking →",
    refundedLabel: "Refunded",
  },
  "client.partial_refund": {
    subject: "Partial refund issued",
    greeting: "Hi {name}, {message}",
    button: "View booking →",
    refundedLabel: "Refunded",
  },
  "client.welcome": {
    subject: "Welcome to Tulala",
    preview: "Welcome to Tulala",
    heading: "Welcome to Tulala",
    // {name} = client name.
    intro:
      "Welcome, {name}. You can now browse talent, send inquiries, and track your bookings all in one place.",
    note: "Tip: every message and offer stays in one organized place — no more scattered WhatsApp threads.",
    button: "Browse talent →",
  },
};

export const CLIENT_ES: typeof CLIENT_EN = {
  "client.inquiry_received": {
    subject: "Recibimos tu solicitud",
    preview: "Recibimos tu solicitud",
    heading: "Recibimos tu solicitud",
    intro:
      "Hola {name}, gracias por contactar a {brand}. Te responderemos lo antes posible.",
    note: "Puedes seguir el estado de tu solicitud desde tu panel.",
    button: "Ver solicitud →",
    dateLabel: "Fecha",
    locationLabel: "Ubicación",
  },
  "client.reply_ready": {
    subject: "{brand} respondió a tu solicitud",
    preview: "Tienes una nueva respuesta",
    heading: "Tienes una respuesta",
    intro:
      "Hola {name}, {brand} acaba de responder a tu solicitud. Abre la conversación para leerla y seguir avanzando.",
    note: "Este enlace abre la conversación que iniciaste.",
    button: "Leer la respuesta →",
  },
  "client.offer_ready": {
    subject: "Tu propuesta está lista",
    preview: "Tu propuesta está lista",
    heading: "Tu propuesta está lista",
    intro: "Hola {name}, la agencia preparó una propuesta para {event}.",
    note: "Revisa la propuesta y acéptala o recházala desde tu panel.",
    button: "Revisar propuesta →",
    totalLabel: "Total",
  },
  "client.booking_confirmed": {
    subject: "Reserva confirmada",
    preview: "Reserva confirmada",
    heading: "Reserva confirmada",
    intro: "Hola {name}, {event} ya quedó confirmada.",
    note: "La agencia se pondrá en contacto contigo con los siguientes pasos. Puedes ver tu reserva desde tu panel.",
    button: "Ver reserva →",
    dateLabel: "Fecha",
    locationLabel: "Ubicación",
  },
  "client.payment_receipt": {
    subject: "Pago recibido",
    preview: "Pago recibido",
    heading: "Pago recibido",
    intro: "Hola {name}, recibimos tu pago para {event}. ¡Gracias!",
    note: "Siempre tendrás una copia de este recibo disponible en tu panel.",
    button: "Ver recibo →",
    amountLabel: "Monto",
    dateLabel: "Fecha",
  },
  "client.deposit_received": {
    subject: "Anticipo recibido — saldo pendiente",
    preview: "Anticipo recibido — saldo pendiente para confirmar tu reserva",
    heading: "Anticipo recibido",
    intro:
      "Hola {name}, recibimos tu anticipo para {event}. Para confirmar la reserva, paga el saldo restante{balanceClause}.",
    note: "Tu reserva está apartada — al pagar el saldo queda confirmada.",
    button: "Pagar saldo →",
    balanceClause: " de {balance}",
    depositLabel: "Anticipo pagado",
    balanceLabel: "Saldo pendiente",
    dateLabel: "Fecha",
  },
  "client.payment_refunded": {
    subject: "Pago reembolsado",
    greeting: "Hola {name}, {message}",
    button: "Ver reserva →",
    refundedLabel: "Reembolsado",
  },
  "client.partial_refund": {
    subject: "Reembolso parcial emitido",
    greeting: "Hola {name}, {message}",
    button: "Ver reserva →",
    refundedLabel: "Reembolsado",
  },
  "client.welcome": {
    subject: "Te damos la bienvenida a Tulala",
    preview: "Te damos la bienvenida a Tulala",
    heading: "Te damos la bienvenida a Tulala",
    intro:
      "Bienvenido, {name}. Ya puedes explorar talento, enviar solicitudes y dar seguimiento a tus reservas, todo en un solo lugar.",
    note: "Consejo: cada mensaje y propuesta queda organizado en un solo lugar — se acabaron los hilos dispersos de WhatsApp.",
    button: "Explorar talento →",
  },
};
