import { pickLocale } from "@/lib/i18n/pick-locale";

/**
 * AUD-027 — free-site shells seed the English default "Inquire". Localise that
 * platform default (and close synonyms) for the visitor locale; custom labels
 * the talent typed stay untouched.
 */
export function localizeDefaultHeaderCtaLabel(label: string, locale: string): string {
  const key = label.trim().toLowerCase();
  if (key === "inquire" || key === "enquiry" || key === "enquire") {
    return pickLocale(locale, { en: "Inquire", es: "Consultar" });
  }
  return label;
}
