/**
 * Accessible (and visible) group name for EN|ES language toggles.
 *
 * Talent site headers already localise via `HeaderSiteLocales` / footer
 * socket (`Idioma`). The shared public + marketing pills still hard-coded
 * English `Language` on Spanish screens (live on tulala.digital/es footer).
 *
 * Neutral Mexican Spanish. No em dashes.
 */
import { pickLocale } from "@/lib/i18n/pick-locale";

export function languageToggleGroupLabel(
  locale: string | null | undefined,
): string {
  // BCP-47 tags like es-MX must still hit the Spanish entry.
  const short = locale?.trim().toLowerCase().split("-")[0] || "en";
  return pickLocale(short, { en: "Language", es: "Idioma" });
}
