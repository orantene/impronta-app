/**
 * Public talent profile (`/t/<code>`) languages, 2026-09-29. Pure: the page
 * follows the TALENT's own languages exactly like their talent site does.
 *
 *   - the requested locale (URL prefix, then cookie, then the URL grammar's
 *     unprefixed default) renders only when it is in the talent's set;
 *     otherwise the talent's primary renders;
 *   - content reads through [rendered, primary];
 *   - hreflang lists the talent's languages only (none when single-language),
 *     each self-canonical, with x-default on the primary.
 */

import { buildLocaleAlternates, type LocaleAlternates } from "@/i18n/alternates";
import { boundTalentSiteLocale } from "./talent-site-locale-routing";

export interface TalentProfileLocale {
  locale: string;
  primary: string;
  /** The talent's languages, primary first. */
  supported: readonly string[];
  /** Content fallback chain: [locale, primary] (deduped). */
  chain: readonly string[];
}

export function decideTalentProfileLocale(input: {
  requested: string | null | undefined;
  primary: string;
  supported: readonly string[];
}): TalentProfileLocale {
  const { primary } = input;
  const supported = [primary, ...input.supported.filter((l) => l !== primary)];
  const locale = boundTalentSiteLocale(input.requested, primary, supported);
  return { locale, primary, supported, chain: locale === primary ? [locale] : [locale, primary] };
}

export function talentProfileAlternates(input: {
  origin: string;
  path: string;
  /** Locale served unprefixed by the host's URL grammar. */
  urlDefault: string;
  profile: TalentProfileLocale;
}): LocaleAlternates {
  const { profile } = input;
  const alt = buildLocaleAlternates({
    origin: input.origin,
    pathnameWithoutLocale: input.path,
    currentLocale: profile.locale,
    defaultLocale: input.urlDefault,
    supportedLocales: profile.supported,
  });
  if (!alt.languages) return alt;
  const languages = { ...alt.languages };
  delete languages["x-default"];
  languages["x-default"] = languages[profile.primary]!;
  return { canonical: alt.canonical, languages };
}

const OG_LOCALE: Record<string, string> = {
  en: "en_US", es: "es_ES", fr: "fr_FR", pt: "pt_BR", it: "it_IT", de: "de_DE",
};

/** `es` -> `es_ES` (OpenGraph locale). */
export function ogLocale(code: string): string {
  return OG_LOCALE[code] ?? code;
}

/** First non-empty value of `map` along `chain`, then `en`, then "". */
export function pickByChain(
  map: Record<string, string | null | undefined> | null | undefined,
  chain: readonly string[],
): string {
  for (const code of [...chain, "en"]) {
    const v = map?.[code]?.trim();
    if (v) return v;
  }
  return "";
}
