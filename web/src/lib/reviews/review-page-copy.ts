/**
 * G2 (TUL-1272 #11): the public review page (/review/{token}) and its form in
 * English and Spanish.
 *
 * PURE and serializable (strings only, `{name}` placeholders), so the server
 * page can hand the whole object to the client form. `REVIEW_PAGE_ES` is typed
 * `typeof REVIEW_PAGE_EN`: a key added to one language and not the other fails
 * the build. Spanish is Mexican Spanish with "tú".
 */

export type ReviewLocale = "en" | "es";

export const REVIEW_PAGE_EN = {
  title: "Leave a review",
  footer: "Reviews are published on the page of the person you booked. You can only review your own bookings.",
  invalidTitle: "This review link isn't valid",
  invalidBody:
    "The link may be mistyped or was never issued. If you were asked to leave a review, open the most recent invite email.",
  expiredTitle: "This review link has expired",
  expiredBody:
    "It may have already been used, or the window to respond has passed. If you'd still like to leave a review, ask for a fresh invite.",
  workedWith: "You worked with",
  service: "Service",
  noteFrom: "A note from {name}",
  askedTitle: "{name} asked you for a review",
  askedBody:
    "To keep reviews honest, we confirm it's really you before publishing. Sign in with the account this invite was sent to, then leave your review.",
  signInContinue: "Sign in and continue",
  // Form
  rate: "Rate {name}",
  rateIntro: "Your honest experience helps other clients decide. It takes a minute.",
  rateService: "Rate {service}",
  guestName: "Your name",
  guestNamePlaceholder: "How your name appears on the review",
  guestNote: "You're reviewing as a guest, so this publishes as an",
  guestNoteStrong: "invited review",
  guestNoteTail: "(not payment-verified).",
  guestSignIn: "Sign in for a verified review",
  starsFor: "Star rating for {name}",
  starsN: "{n} stars",
  starsOne: "1 star",
  attrStars: "{label}: {stars}",
  tapToRate: "Tap to rate",
  noteLabel: "Add a note (optional)",
  notePlaceholder: "What stood out about working with {name}?",
  bookAgain: "Would you book them again?",
  bookAgainFor: "Would you book {name} again?",
  yes: "Yes",
  notSure: "Not sure",
  no: "No",
  qualities: "Rate specific qualities (optional)",
  qualityRating: "{label} rating",
  professionalism: "Professionalism",
  skill: "Skill",
  communication: "Communication",
  reliability: "Reliability",
  traitsLabel: "What stood out? (optional)",
  traitOnTime: "On time",
  traitCommunication: "Great communication",
  traitPrepared: "Well prepared",
  traitBrief: "Delivered the brief",
  traitEasy: "Easy to work with",
  privateNote: "Private note. Only {name} sees this, to help them improve.",
  /** TUL-1686: team studio, the note goes to the workspace ({name} = the workspace). */
  privateNoteWorkspace: "Private note. Only {name} sees this.",
  /** TUL-1686: who reads it is unknown, so name no one. */
  privateNoteNeutral: "Private note, not shown publicly.",
  privatePlaceholder: "Anything you'd share privately to help them grow?",
  anon: "Post anonymously (show as {as})",
  anonVerified: "Verified client",
  anonPlain: "a client",
  signInToPublish: "Please sign in to publish your review.",
  signInWhy:
    "To keep reviews honest, we confirm it's really you before publishing. Sign in with the account this invite was sent to.",
  publish: "Publish review",
  publishing: "Publishing…",
  pickStars: "Please pick a star rating (1 to 5).",
  saveFailed: "Could not save your review. Please try again.",
  thanks: "Thank you for reviewing {name}.",
  published: "Your {n}-star review is now published on their page.",
  viewPage: "View {name}'s page",
  // Server messages, localized by their English text
  errInvalid: "This review link is not valid.",
  errSpent: "This review link has expired or was already used.",
  errNoBooking: "This invite is not linked to a booking, so it can't take a review yet.",
  errMismatch: "We couldn't save this review. This link may not match your account.",
  errGuest: "We couldn't save your review. Please try again.",
  errRating: "Rating must be between 1 and 5.",
  theTalent: "the talent",
};

export const REVIEW_PAGE_ES: typeof REVIEW_PAGE_EN = {
  title: "Deja tu reseña",
  footer: "Las reseñas se publican en la página de quien reservaste. Solo puedes reseñar tus propias reservas.",
  invalidTitle: "Este enlace de reseña no es válido",
  invalidBody:
    "Puede que el enlace tenga un error o que nunca se haya emitido. Si te pidieron una reseña, abre el correo de invitación más reciente.",
  expiredTitle: "Este enlace de reseña venció",
  expiredBody:
    "Puede que ya se haya usado o que haya pasado el plazo para responder. Si aún quieres dejar una reseña, pide una invitación nueva.",
  workedWith: "Reservaste con",
  service: "Servicio",
  noteFrom: "Un mensaje de {name}",
  askedTitle: "{name} te pidió una reseña",
  askedBody:
    "Para mantener las reseñas honestas, confirmamos que eres tú antes de publicar. Inicia sesión con la cuenta a la que se envió esta invitación y deja tu reseña.",
  signInContinue: "Inicia sesión y continúa",
  rate: "Califica a {name}",
  rateIntro: "Tu experiencia sincera ayuda a otras personas a decidir. Toma un minuto.",
  rateService: "Califica {service}",
  guestName: "Tu nombre",
  guestNamePlaceholder: "Cómo aparecerá tu nombre en la reseña",
  guestNote: "Estás reseñando como invitado, así que se publica como una",
  guestNoteStrong: "reseña por invitación",
  guestNoteTail: "(sin pago verificado).",
  guestSignIn: "Inicia sesión para una reseña verificada",
  starsFor: "Calificación en estrellas para {name}",
  starsN: "{n} estrellas",
  starsOne: "1 estrella",
  attrStars: "{label}: {stars}",
  tapToRate: "Toca para calificar",
  noteLabel: "Agrega un comentario (opcional)",
  notePlaceholder: "¿Qué destacas de trabajar con {name}?",
  bookAgain: "¿Volverías a reservar?",
  bookAgainFor: "¿Volverías a reservar con {name}?",
  yes: "Sí",
  notSure: "No estoy seguro",
  no: "No",
  qualities: "Califica aspectos específicos (opcional)",
  qualityRating: "Calificación de {label}",
  professionalism: "Profesionalismo",
  skill: "Habilidad",
  communication: "Comunicación",
  reliability: "Confiabilidad",
  traitsLabel: "¿Qué destacó? (opcional)",
  traitOnTime: "Puntual",
  traitCommunication: "Gran comunicación",
  traitPrepared: "Bien preparado",
  traitBrief: "Cumplió lo acordado",
  traitEasy: "Fácil de tratar",
  privateNote: "Nota privada. Solo {name} la ve, para ayudar a mejorar.",
  privateNoteWorkspace: "Nota privada. Solo {name} la ve.",
  privateNoteNeutral: "Nota privada, no se muestra públicamente.",
  privatePlaceholder: "¿Algo que quieras compartir en privado para ayudar a crecer?",
  anon: "Publicar de forma anónima (se muestra como {as})",
  anonVerified: "Cliente verificado",
  anonPlain: "un cliente",
  signInToPublish: "Inicia sesión para publicar tu reseña.",
  signInWhy:
    "Para mantener las reseñas honestas, confirmamos que eres tú antes de publicar. Inicia sesión con la cuenta a la que se envió esta invitación.",
  publish: "Publicar reseña",
  publishing: "Publicando…",
  pickStars: "Elige una calificación de 1 a 5 estrellas.",
  saveFailed: "No pudimos guardar tu reseña. Inténtalo de nuevo.",
  thanks: "Gracias por reseñar a {name}.",
  published: "Tu reseña de {n} estrellas ya está publicada en su página.",
  viewPage: "Ver la página de {name}",
  errInvalid: "Este enlace de reseña no es válido.",
  errSpent: "Este enlace de reseña venció o ya se usó.",
  errNoBooking: "Esta invitación no está ligada a una reserva, así que aún no puede recibir una reseña.",
  errMismatch: "No pudimos guardar esta reseña. Puede que el enlace no coincida con tu cuenta.",
  errGuest: "No pudimos guardar tu reseña. Inténtalo de nuevo.",
  errRating: "La calificación debe ser de 1 a 5.",
  theTalent: "la persona",
};

export type ReviewPageCopy = typeof REVIEW_PAGE_EN;

export function getReviewPageCopy(locale: ReviewLocale): ReviewPageCopy {
  return locale === "es" ? REVIEW_PAGE_ES : REVIEW_PAGE_EN;
}

/** Fill `{name}` placeholders. A missing value leaves the placeholder out, never "undefined". */
export function fillCopy(template: string, vars: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{(\w+)\}/g, (_m, k: string) => {
    const v = vars[k];
    return v == null ? "" : String(v);
  });
}

function pick(tag: string | null | undefined): ReviewLocale | null {
  const t = (tag ?? "").trim().toLowerCase();
  if (!t) return null;
  if (t.startsWith("es")) return "es";
  if (t.startsWith("en")) return "en";
  return null;
}

/**
 * The language of the review page: the language the booking was made in wins
 * (the guest already chose it), then the browser's first preference, then English.
 */
export function resolveReviewLocale(input: {
  bookingLocale?: string | null;
  acceptLanguage?: string | null;
}): ReviewLocale {
  const fromBooking = pick(input.bookingLocale);
  if (fromBooking) return fromBooking;
  const first = (input.acceptLanguage ?? "").split(",")[0]?.split(";")[0];
  return pick(first) ?? "en";
}

/** Long date in the page language; the raw ISO date when it does not parse. */
export function formatReviewDate(iso: string | null, locale: ReviewLocale): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return d.toLocaleDateString(locale === "es" ? "es-MX" : "en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

/** The canonical (English) trait values stay what is stored; only the label is localized. */
export const REVIEW_TRAITS = [
  { value: "On time", key: "traitOnTime" },
  { value: "Great communication", key: "traitCommunication" },
  { value: "Well prepared", key: "traitPrepared" },
  { value: "Delivered the brief", key: "traitBrief" },
  { value: "Easy to work with", key: "traitEasy" },
] as const satisfies ReadonlyArray<{ value: string; key: keyof ReviewPageCopy }>;

/** Localize a server error message that arrives in English; unknown text becomes the generic one. */
export function localizeReviewError(message: string | null | undefined, t: ReviewPageCopy): string {
  const m = (message ?? "").trim();
  if (!m) return t.saveFailed;
  const pairs: Array<[string, string]> = [
    [REVIEW_PAGE_EN.errInvalid, t.errInvalid],
    [REVIEW_PAGE_EN.errSpent, t.errSpent],
    [REVIEW_PAGE_EN.errNoBooking, t.errNoBooking],
    [REVIEW_PAGE_EN.errMismatch, t.errMismatch],
    [REVIEW_PAGE_EN.errGuest, t.errGuest],
    [REVIEW_PAGE_EN.errRating, t.errRating],
  ];
  return pairs.find(([en]) => en === m)?.[1] ?? t.saveFailed;
}
