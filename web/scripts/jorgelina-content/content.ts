/**
 * TUL-73: the content Oran approved on the Notion ticket for Jorgelina's real
 * site, verbatim. Nothing here is invented or machine-translated, except the
 * English booking policies (POLICIES_EN), which are a clause-by-clause
 * translation of the approved Spanish text and are marked as such.
 *
 * No em dashes anywhere (a test enforces it).
 */

export const ALLOWED_PROFILE_CODE = "TAL-93938";
export const ALLOWED_SITE_SLUG = "book-jorgelina";
/** The QA talent. It must never be a target of this script. */
export const FORBIDDEN_PROFILE_CODES: readonly string[] = ["TAL-93900"];
export const FORBIDDEN_SITE_SLUGS: readonly string[] = ["jorg-beauty-qa"];

export const HERO = {
  headline: { es: "Pestañas que enmarcan tu mirada.", en: "Lashes that frame your look." },
  subline: {
    es: "Lashista en Playa del Carmen · Extensiones desde $700 MXN",
    en: "Lash artist in Playa del Carmen · Extensions from $700 MXN",
  },
} as const;

export const TICKER = {
  es: "Extensiones clásicas ✦ Efecto rímel ✦ Volumen 2D a 5D ✦ Volumen americano ✦ Lifting de pestañas ✦ Lami Brows",
  en: "Classic extensions ✦ Mascara effect ✦ 2D to 5D volume ✦ American volume ✦ Lash lift ✦ Lami Brows",
} as const;

export const TICKER_SEPARATOR = " ✦ ";

export type PolicyClauseText = { title: string; body: string };

export const POLICIES_ES: readonly PolicyClauseText[] = [
  { title: "Confirmación", body: "Tu cita queda confirmada al reservar. Te escribo por WhatsApp un día antes." },
  { title: "Cambios y cancelaciones", body: "Avísame con al menos 24 horas para cambiar o cancelar sin problema." },
  { title: "Retraso", body: "Hay 15 minutos de tolerancia. Después puedo acortar el servicio o reprogramar." },
  { title: "No asistir", body: "Si no llegas sin avisar dos veces, te pediré un anticipo para la siguiente cita." },
  {
    title: "Retoques de pestañas",
    body: "Se agendan entre 2 y 3 semanas después de la aplicación y con al menos 40% de pestañas puestas; si no, se cobra como aplicación nueva.",
  },
  { title: "Pago", body: "En el estudio, en efectivo o transferencia. No se cobra nada al reservar." },
  { title: "Salud", body: "Avísame de alergias, embarazo o tratamientos en los ojos antes de la cita." },
];

/** FAITHFUL TRANSLATION of POLICIES_ES, clause by clause. Not new content. */
export const POLICIES_EN: readonly PolicyClauseText[] = [
  { title: "Confirmation", body: "Your appointment is confirmed when you book. I message you on WhatsApp a day before." },
  { title: "Changes and cancellations", body: "Let me know at least 24 hours ahead to change or cancel with no problem." },
  { title: "Late arrival", body: "There are 15 minutes of tolerance. After that I may shorten the service or reschedule." },
  { title: "No-shows", body: "If you miss two appointments without letting me know, I will ask for a deposit for the next one." },
  {
    title: "Lash touch-ups",
    body: "They are booked 2 to 3 weeks after the application and with at least 40% of the lashes still in place; otherwise they are charged as a new application.",
  },
  { title: "Payment", body: "At the studio, in cash or by transfer. Nothing is charged when you book." },
  { title: "Health", body: "Tell me about allergies, pregnancy or eye treatments before the appointment." },
];

/** The stored snapshot format: "1. Title\nBody" blocks separated by a blank line. */
export function policyText(clauses: readonly PolicyClauseText[]): string {
  return clauses.map((c, i) => `${i + 1}. ${c.title}\n${c.body}`).join("\n\n");
}

/** Approved service descriptions (ES), keyed by the current Spanish title. */
export const SERVICE_DESCRIPTIONS_ES: ReadonlyArray<{ title: string; description: string }> = [
  { title: "Extensiones clásicas", description: "Una extensión por pestaña natural. Resultado natural, como rímel suave." },
  { title: "Efecto rímel", description: "Clásicas con mapeo que imita el rímel: más definición sin volumen." },
  { title: "Tecnológicas 2D", description: "Abanicos ligeros de 2 extensiones. Más densidad, se ven naturales." },
  { title: "Tecnológicas 3D", description: "Abanicos de 3. Mirada más llena para el día a día." },
  { title: "Tecnológicas 4D o 5D", description: "Abanicos de 4 o 5. Volumen marcado, ideal para eventos." },
  { title: "Volumen americano", description: "Máximo volumen y oscuridad, efecto glam." },
  { title: "Lifting de pestañas", description: "Curva y eleva tus pestañas naturales, dura 6 a 8 semanas." },
  { title: "Set lifting + Lami Brows", description: "Lifting de pestañas y laminado de cejas en una sola cita." },
  { title: "Lami Brows", description: "Cejas peinadas y con forma por 6 semanas." },
  { title: "Perfilado", description: "Forma limpia con pinza." },
  { title: "Henna Brows", description: "Color y relleno que dura hasta 2 semanas en piel." },
];

/**
 * Approved ENGLISH service descriptions, keyed by the SAME Spanish titles as
 * SERVICE_DESCRIPTIONS_ES (same exact-title matching). Stored in
 * description_i18n.en only, behind --include-english-descriptions.
 */
export const SERVICE_DESCRIPTIONS_EN: ReadonlyArray<{ title: string; description: string }> = [
  { title: "Extensiones clásicas", description: "One extension per natural lash. A natural result, like soft mascara." },
  { title: "Efecto rímel", description: "Classic extensions with a mapping that mimics mascara: more definition without volume." },
  { title: "Tecnológicas 2D", description: "Light fans of 2 extensions. More density, and they look natural." },
  { title: "Tecnológicas 3D", description: "Fans of 3. A fuller look for everyday wear." },
  { title: "Tecnológicas 4D o 5D", description: "Fans of 4 or 5. Pronounced volume, ideal for events." },
  { title: "Volumen americano", description: "Maximum volume and darkness, a glam effect." },
  { title: "Lifting de pestañas", description: "Curls and lifts your natural lashes, lasts 6 to 8 weeks." },
  { title: "Set lifting + Lami Brows", description: "Lash lift and brow lamination in a single appointment." },
];

/** Nails keep their names; they must read in Spanish. Matched by title, never guessed. */
export const NAIL_NAMES_ES: readonly string[] = ["Gel semipermanente", "Soft Gel", "Acrygel", "Rubber Gel"];
export const NAIL_NOTE_ES = "Desde $500 = precio base; el diseño se cotiza al enviar tu foto o tu diseño.";

export const CONTACT = {
  whatsappNumber: "+52 913 230 0376",
  whatsappHref: "https://wa.me/529132300376",
  instagramHandle: "@jorgbeauty",
  instagramHref: "https://instagram.com/jorgbeauty",
} as const;

/** Every user-facing string above, for the no-em-dash test. */
export function allUserFacingStrings(): string[] {
  return [
    HERO.headline.es, HERO.headline.en, HERO.subline.es, HERO.subline.en,
    TICKER.es, TICKER.en,
    ...POLICIES_ES.flatMap((c) => [c.title, c.body]),
    ...POLICIES_EN.flatMap((c) => [c.title, c.body]),
    ...SERVICE_DESCRIPTIONS_ES.flatMap((s) => [s.title, s.description]),
    ...SERVICE_DESCRIPTIONS_EN.flatMap((s) => [s.title, s.description]),
    ...NAIL_NAMES_ES, NAIL_NOTE_ES,
    CONTACT.whatsappNumber, CONTACT.instagramHandle,
  ];
}
