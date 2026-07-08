/**
 * Reviews email copy fragment (EN + ES). Aggregated by `../email-copy.ts`.
 *
 * Covers the review-collection templates in `emails/reviews/`:
 *  - ReviewRequestInvite.tsx    → catalog templateId `review.request_invite`.
 *  - ReviewRequestReminder.tsx  → catalog templateId `review.request_reminder`.
 *  - ReviewReceived.tsx         → catalog templateId `review.received`.
 *
 * `REVIEWS_ES: typeof REVIEWS_EN` enforces key + shape parity at build time. No
 * `as const` — values stay `string` so ES can hold different words. Spanish is
 * natural Mexican Spanish using "tú". Dynamic values use `{var}` placeholders
 * mirroring each template's payload keys.
 *
 * FTC: the invite + reminder copy is a neutral request for honest feedback with
 * NO incentive language (no cash, coupons, discounts). Never uses "buyer"/"cart".
 */

export const REVIEWS_EN = {
  // ReviewRequestInvite.tsx — sent to a past client.
  "review.request_invite": {
    subject: "{talent} would love your feedback",
    preview: "{talent} would love your feedback",
    fallbackName: "there",
    fallbackTalent: "The talent you worked with",
    fallbackEvent: "your recent booking",
    heading: "Hi {name}, how did it go?",
    intro:
      "{talent} would love your feedback on {event}. Sharing an honest review takes about 20 seconds and helps other clients know what to expect.",
    labelEvent: "Event",
    labelDate: "Date",
    note: "Your review is honest feedback from a real booking. There is nothing to buy and no reward for leaving one.",
    button: "Leave a review →",
  },
  // ReviewRequestReminder.tsx — one gentle follow-up (day 7) for a pending request.
  "review.request_reminder": {
    subject: "A quick reminder from {talent}",
    preview: "A quick reminder from {talent}",
    fallbackName: "there",
    fallbackTalent: "The talent you worked with",
    fallbackEvent: "your recent booking",
    heading: "Hi {name}, still have a moment?",
    intro:
      "Just a gentle reminder: {talent} would still love your feedback on {event}. It takes about 20 seconds, and this is the only reminder we will send.",
    labelEvent: "Event",
    labelDate: "Date",
    note: "Your review is honest feedback from a real booking. There is nothing to buy and no reward for leaving one.",
    button: "Leave a review →",
  },
  // ReviewReceived.tsx — sent to the talent when a client review publishes.
  "review.received": {
    subject: "You received a review from a client",
    preview: "You received a review from a client",
    fallbackName: "there",
    heading: "You received a new review",
    intro:
      "Hi {name}, a client just left you a review. Open your Reviews page to read it in full and reply.",
    labelEvent: "Event",
    labelDate: "Date",
    note: "Reviews shape your standing with future clients. You can respond to any review once.",
    button: "View your reviews →",
  },
};

export const REVIEWS_ES: typeof REVIEWS_EN = {
  "review.request_invite": {
    subject: "A {talent} le encantaría tu opinión",
    preview: "A {talent} le encantaría tu opinión",
    fallbackName: "hola",
    fallbackTalent: "El talento con quien trabajaste",
    fallbackEvent: "tu reservación reciente",
    heading: "Hola {name}, ¿cómo te fue?",
    intro:
      "A {talent} le encantaría conocer tu opinión sobre {event}. Dejar una reseña honesta toma unos 20 segundos y ayuda a otros clientes a saber qué esperar.",
    labelEvent: "Evento",
    labelDate: "Fecha",
    note: "Tu reseña es una opinión honesta de una reservación real. No hay nada que comprar ni recompensa por dejarla.",
    button: "Dejar una reseña →",
  },
  "review.request_reminder": {
    subject: "Un recordatorio rápido de {talent}",
    preview: "Un recordatorio rápido de {talent}",
    fallbackName: "hola",
    fallbackTalent: "El talento con quien trabajaste",
    fallbackEvent: "tu reservación reciente",
    heading: "Hola {name}, ¿tienes un momento?",
    intro:
      "Solo un recordatorio amable: a {talent} aún le encantaría tu opinión sobre {event}. Toma unos 20 segundos y este es el único recordatorio que te enviaremos.",
    labelEvent: "Evento",
    labelDate: "Fecha",
    note: "Tu reseña es una opinión honesta de una reservación real. No hay nada que comprar ni recompensa por dejarla.",
    button: "Dejar una reseña →",
  },
  "review.received": {
    subject: "Recibiste una reseña de un cliente",
    preview: "Recibiste una reseña de un cliente",
    fallbackName: "hola",
    heading: "Recibiste una nueva reseña",
    intro:
      "Hola {name}, un cliente acaba de dejarte una reseña. Abre tu página de Reseñas para leerla completa y responder.",
    labelEvent: "Evento",
    labelDate: "Fecha",
    note: "Las reseñas definen tu reputación con futuros clientes. Puedes responder a cada reseña una vez.",
    button: "Ver tus reseñas →",
  },
};
