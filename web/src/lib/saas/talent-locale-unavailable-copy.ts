/**
 * Soft notice when a visitor opens `/en` (or another platform locale) on a
 * talent site that only publishes one language (TUL-516 B1).
 *
 * Written in the language the visitor ASKED for (the only reader of this page
 * is someone who requested a language the site does not have), naming the
 * language the site is in. `siteLine` repeats the fact in the site's own
 * language. Neutral Mexican Spanish (tú). No em dashes.
 */
import { isSpanishLocale } from "@/lib/locale-time";

export type TalentLocaleUnavailableCopy = {
  /** Language the notice is written in (`<html lang>` / `lang` attribute). */
  lang: "es" | "en";
  title: string;
  heading: string;
  body: string;
  homeCta: string;
  /** Same fact in the site's own language; null when it would repeat the heading. */
  siteLine: { lang: "es" | "en"; text: string } | null;
};

export function talentLocaleUnavailableCopy(input: {
  /** Prefix the visitor asked for (e.g. "en"); falls back to English. */
  requested: string | undefined | null;
  /** Language the site publishes. */
  site: string | undefined | null;
}): TalentLocaleUnavailableCopy {
  const siteEs = isSpanishLocale(input.site);
  const askedEs = isSpanishLocale(input.requested);
  const siteLine = (lang: "es" | "en") =>
    lang === "es"
      ? { lang, text: "Este sitio está solo en español." }
      : { lang, text: "This site is in English only." };

  if (askedEs) {
    const heading = siteEs ? "Este sitio está solo en español" : "Este sitio está solo en inglés";
    return {
      lang: "es",
      title: siteEs ? "Sitio solo en español" : "Sitio solo en inglés",
      heading,
      body: siteEs
        ? "No hay otra versión de idioma. Puedes seguir en español desde el inicio."
        : "No hay una versión en español. Puedes seguir en inglés desde el inicio.",
      homeCta: "Ir al inicio",
      siteLine: siteEs ? null : siteLine("en"),
    };
  }
  return {
    lang: "en",
    title: siteEs ? "This site is in Spanish only" : "This site is in English only",
    heading: siteEs ? "This site is in Spanish only" : "This site is in English only",
    body: siteEs
      ? "There is no English version. You can continue in Spanish from the home page."
      : "There is no page in that language. You can continue in English from the home page.",
    homeCta: "Go to homepage",
    siteLine: siteEs ? siteLine("es") : null,
  };
}
