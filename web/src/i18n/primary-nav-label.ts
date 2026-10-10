/**
 * Accessible name for the site header's main nav (`aria-label`).
 * GRK-101: was hard-coded English "Primary" on Spanish public sites.
 */
import { pickLocale } from "@/lib/i18n/pick-locale";

export function primaryNavAriaLabel(locale: string | null | undefined): string {
  const short = locale?.trim().toLowerCase().split("-")[0] || "en";
  return pickLocale(short, {
    en: "Primary",
    es: "Principal",
  });
}
