/**
 * Soft notice when a visitor opens `/en` (or another platform locale) on a
 * talent site that only publishes one language (TUL-516 B1).
 *
 * Neutral Mexican Spanish (tú). No em dashes.
 */
import { isSpanishLocale } from "@/lib/locale-time";

export type TalentLocaleUnavailableCopy = {
  title: string;
  heading: string;
  body: string;
  homeCta: string;
};

export function talentLocaleUnavailableCopy(
  locale: string | undefined | null,
): TalentLocaleUnavailableCopy {
  if (isSpanishLocale(locale)) {
    return {
      title: "Sitio solo en español",
      heading: "Este sitio está solo en español",
      body: "No hay una versión en inglés. Puedes seguir en español desde el inicio.",
      homeCta: "Ir al inicio",
    };
  }
  return {
    title: "This site is in English only",
    heading: "This site is in English only",
    body: "There is no page in that language. You can continue in English from the home page.",
    homeCta: "Go to homepage",
  };
}
