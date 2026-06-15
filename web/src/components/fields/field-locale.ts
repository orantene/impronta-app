// Locale helpers for the shared <FieldEditor> and its callers. Extracted from
// FieldEditor.tsx (which hit the 800-line cap) — pure functions, no React.
//
// Locale source: the app's `locale` cookie (set by the /es URL rewrite +
// tenant default_locale). There is no per-user locale. Each helper falls back
// to the English value, so an untranslated field still renders.

/** Read the app's `locale` cookie client-side. "en" on the server / no cookie. */
export function readLocale(): string {
  if (typeof document === "undefined") return "en";
  const m = document.cookie.match(/(?:^|;\s*)locale=([^;]+)/);
  return m?.[1] === "es" ? "es" : "en";
}

/** Locale-aware field label — Spanish when locale=es AND label_es set. */
export function fieldLabel(
  field: { label: string; label_es?: string | null },
  locale: string,
): string {
  if (locale === "es" && field.label_es && field.label_es.trim()) {
    return field.label_es.trim();
  }
  return field.label;
}

/** Locale-aware helper text — Spanish when locale=es AND helper_es set. */
export function fieldHelper(
  field: { helper?: string | null; helper_es?: string | null },
  locale: string,
): string | null {
  if (locale === "es" && field.helper_es && field.helper_es.trim()) {
    return field.helper_es.trim();
  }
  return field.helper ?? null;
}

/** Locale-aware option label — looks up options_es[value] when locale=es,
 *  falling back to the English option string itself. */
export function optionLabel(
  field: { options_es?: Record<string, string> | null },
  value: string,
  locale: string,
): string {
  if (locale === "es" && field.options_es) {
    const es = field.options_es[value];
    if (es && es.trim()) return es.trim();
  }
  return value;
}
