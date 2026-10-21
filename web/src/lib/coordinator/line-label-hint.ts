/**
 * The hint under an offer line's free-text label (TUL-1373). The label can reach
 * the client, so the coordinator is asked not to put a person's name or contact
 * details in it. A hint only, never blocking.
 */
export const LINE_LABEL_HINT = {
  en: "Don't include names or contact details.",
  es: "No incluyas nombres ni datos de contacto.",
} as const;

export function lineLabelHint(locale: string): string {
  return locale.toLowerCase().startsWith("es") ? LINE_LABEL_HINT.es : LINE_LABEL_HINT.en;
}
