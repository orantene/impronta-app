import { pickLocale } from "@/lib/i18n/pick-locale";

type Loc = Parameters<typeof pickLocale>[0];

/**
 * SERP title for a talent profile, in the page language (the /es/ URL is its
 * own indexable page). Query-shaped: "<name>, <type> in <place>".
 */
export function talentProfileMetaTitle(
  locale: Loc,
  name: string,
  talentType: string,
  loc: string | null | undefined,
): string {
  return loc
    ? pickLocale(locale, {
        en: `${name}, ${talentType} in ${loc}`,
        es: `${name}, ${talentType} en ${loc}`,
      })
    : `${name}, ${talentType}`;
}

/** Brand-neutral fallback description when the talent has no bio. */
export function talentProfileMetaFallbackDescription(
  locale: Loc,
  name: string,
  talentType: string,
  loc: string | null | undefined,
): string {
  return pickLocale(locale, {
    en: `${name}, ${talentType}${loc ? ` in ${loc}` : ""}. See the portfolio, services and availability, and send a booking request.`,
    es: `${name}, ${talentType}${loc ? ` en ${loc}` : ""}. Mira su portafolio, servicios y disponibilidad, y envía una solicitud de reserva.`,
  });
}
