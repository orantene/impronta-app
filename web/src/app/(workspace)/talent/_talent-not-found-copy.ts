// Talent segment 404 copy, en + es (TUL-670): the root not-found resolved the
// request locale, not the dashboard language, so ES talents saw English.

export const TALENT_NOT_FOUND_COPY = {
  en: {
    eyebrow: "Talent",
    title: "Page not found",
    body: "We couldn't find that page. It may have moved. Your profile and inquiries are safe.",
    home: "Back to Today",
  },
  es: {
    eyebrow: "Talento",
    title: "Página no encontrada",
    body: "No encontramos esa página. Puede que se haya movido. Tu perfil y tus solicitudes están a salvo.",
    home: "Volver a Hoy",
  },
} as const;

export function talentNotFoundCopy(locale: string | null | undefined) {
  return locale?.toLowerCase().startsWith("es") ? TALENT_NOT_FOUND_COPY.es : TALENT_NOT_FOUND_COPY.en;
}

/** Fills the dashboard content area so the cream background never stops partway down. */
export const TALENT_NOT_FOUND_MIN_HEIGHT = "100dvh";
