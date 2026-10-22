/**
 * TUL-121 theme16: marketing modal dismiss control aria.
 * Live `/es` still exposed English `Close` on story + login dialogs.
 *
 * Neutral Mexican Spanish. No em dashes.
 */
import { pickLocale } from "@/lib/i18n/pick-locale";

export function marketingModalCloseLabel(
  locale: string | null | undefined,
): string {
  // BCP-47 tags like es-MX must still hit the Spanish entry.
  const short = locale?.trim().toLowerCase().split("-")[0] || "en";
  return pickLocale(short, { en: "Close", es: "Cerrar" });
}
