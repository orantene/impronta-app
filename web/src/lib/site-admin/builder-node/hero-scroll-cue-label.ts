/** The hero "scroll" cue text in the page's language (TUL-711). Spanish for any es-*, else English. */
export function heroScrollCueLabel(locale?: string | null): string {
  return (locale ?? "").toLowerCase().startsWith("es") ? "Desplázate" : "Scroll";
}
