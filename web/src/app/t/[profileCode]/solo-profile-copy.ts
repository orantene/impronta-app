/**
 * TUL-707: an independent professional's hub profile has no agency, so the
 * agency wording (roster, represented talent, contact the agency) is swapped
 * for solo wording. Pure; wraps the page translator for the freelancer surface.
 */
import { pickLocale } from "@/lib/i18n/pick-locale";

export { profilePriceCurrency } from "./profile-price-currency";

type Translate = (key: string) => string;

export const SOLO_PROFILE_BRAND = "Tulala";

export function soloProfileOverrides(locale: string): Record<string, string> {
  const l = (en: string, es: string) => pickLocale(locale, { en, es });
  return {
    "public.profile.footerCtaBody": l(
      "Add this professional to your inquiry list, browse more talent, or reach out directly.",
      "Añade a este profesional a tu lista de consulta, explora más talento o escríbele directamente.",
    ),
    "public.profile.moreFromRoster": l("More talent on Tulala", "Más talento en Tulala"),
    "public.profile.cta.contactImpronta": l("Contact directly", "Contactar directamente"),
  };
}

export function withSoloProfileCopy(t: Translate, locale: string): Translate {
  const overrides = soloProfileOverrides(locale);
  return (key) => overrides[key] ?? t(key);
}
