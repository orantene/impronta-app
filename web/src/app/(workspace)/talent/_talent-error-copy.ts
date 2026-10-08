// Talent error boundary copy, en + es (2026-10-01): ES talents saw English.

/** Boundary copy, en + es. Kept outside error.tsx so tests import it. */
export const TALENT_ERROR_COPY = {
  en: {
    eyebrow: "Talent",
    title: "Something went wrong",
    body: "This section failed to load. Retry to reload it. Your profile and inquiry data are safe.",
    retry: "Retry",
    home: "Go home",
  },
  es: {
    eyebrow: "Talento",
    title: "Algo salió mal",
    body: "Esta sección no se pudo cargar. Vuelve a intentarlo. Tu perfil y tus solicitudes están a salvo.",
    retry: "Reintentar",
    home: "Ir al inicio",
  },
} as const;

export function talentErrorCopy(locale: string | null | undefined) {
  return locale?.toLowerCase().startsWith("es") ? TALENT_ERROR_COPY.es : TALENT_ERROR_COPY.en;
}

