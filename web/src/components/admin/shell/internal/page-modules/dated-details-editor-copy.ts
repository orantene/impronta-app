export type DatedDetailsEditorCopy = {
  title: string;
  hint: string;
  privateOnRequest: string;
  privateHint: string;
  save: string;
  saved: string;
  failed: string;
  language: string;
};

export const DATED_DETAILS_EDITOR_COPY: Record<"en" | "es", DatedDetailsEditorCopy> = {
  en: {
    title: "Details people see",
    hint: "Fill only what applies. Empty fields are not shown.",
    privateOnRequest: "Private date on request",
    privateHint: "People send a request instead of taking a spot.",
    save: "Save details",
    saved: "Saved.",
    failed: "Could not save. Try again in a moment.",
    language: "Language",
  },
  es: {
    title: "Detalles que ve la gente",
    hint: "Llena solo lo que aplique. Los campos vacíos no se muestran.",
    privateOnRequest: "Fecha privada a pedido",
    privateHint: "La gente envía una solicitud en lugar de tomar un lugar.",
    save: "Guardar detalles",
    saved: "Guardado.",
    failed: "No se pudo guardar. Inténtalo de nuevo en un momento.",
    language: "Idioma",
  },
};

export function datedDetailsEditorCopy(locale: string): DatedDetailsEditorCopy {
  return locale.toLowerCase().startsWith("es") ? DATED_DETAILS_EDITOR_COPY.es : DATED_DETAILS_EDITOR_COPY.en;
}
