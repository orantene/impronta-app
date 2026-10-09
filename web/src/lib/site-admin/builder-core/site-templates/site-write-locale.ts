/**
 * TUL-506: the locale a composed site is written in.
 *
 * The storefront serves the tenant's DEFAULT locale at the site root
 * (`agency_business_identity.default_locale`); pages written in another locale
 * only exist under `/<locale>/…`, so the root renders the platform fallback
 * (default header, default `/services` links) instead of the composed site.
 * The UI language of whoever signed up is NOT the site's language: a Spanish
 * workspace created from an English browser used to be written as `en`.
 *
 * Order: the tenant's own default locale when it is one we compose in, else
 * an explicit request, else Spanish (the platform default). Pure.
 */
import type { SiteLocale } from "./types";

const isSiteLocale = (v: unknown): v is SiteLocale => v === "es" || v === "en";

export function siteWriteLocale(input: { tenantDefault?: string | null; explicit?: string | null }): SiteLocale {
  if (isSiteLocale(input.tenantDefault)) return input.tenantDefault;
  if (isSiteLocale(input.explicit)) return input.explicit;
  return "es";
}
