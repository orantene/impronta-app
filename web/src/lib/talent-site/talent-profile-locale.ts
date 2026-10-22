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

/**
 * TUL-687: an explicit `?lang=xx` on `/t/<code>` wins over the path/cookie
 * locale (middleware only reads it on auth routes). Anything that is not a
 * plain two-letter code is ignored; the talent's set still bounds the result.
 */
export function applyLangQuery(
  requested: string | null | undefined,
  lang: string | string[] | null | undefined,
): string | null | undefined {
  const raw = Array.isArray(lang) ? lang[0] : lang;
  const code = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return /^[a-z]{2}$/.test(code) ? code : requested;
}

/**
 * TUL-736: a talent who never chose languages (no preferred_locale, no
 * secondaries) has no bound, so /es/t/<code> renders Spanish chrome. An
 * explicit choice (even a single language) still bounds the set.
 */
export function talentProfileSupportedSet(input: {
  unset: boolean;
  supported: readonly string[];
  publicLocales: readonly string[];
}): readonly string[] {
  return input.unset && input.publicLocales.length > 0 ? input.publicLocales : input.supported;
}

export function decideTalentProfileLocale(input: {
  requested: string | null | undefined;
  primary: string;
  supported: readonly string[];
  /**
   * TUL-736: the language the URL itself names (`/es/...` prefix or `?lang=`), plus the platform's
   * public locales. A signup stamps `preferred_locale = en`, which reads as a one-language
   * talent, and that bound turned `/es/t/<code>` English. An explicit URL language wins for the
   * page chrome; content still falls back to the talent's primary through `chain`.
   */
  explicitUrlLocale?: string | null;
  publicLocales?: readonly string[];
}): TalentProfileLocale {
  const { primary } = input;
  const supported = [primary, ...input.supported.filter((l) => l !== primary)];
  const bound = boundTalentSiteLocale(input.requested, primary, supported);
  const explicit = input.explicitUrlLocale;
  const locale = explicit && input.publicLocales?.includes(explicit) ? explicit : bound;
  return { locale, primary, supported, chain: locale === primary ? [locale] : [locale, primary] };
}

/**
 * TUL-875: the profile code of a `/t/<code>` request (optionally `/xx/t/<code>`),
 * or null for any other path. Used so the root layout can ask the SAME
 * decision the page and <head> make.
 */
export function talentProfileCodeFromPathname(pathname: string | null | undefined): string | null {
  const m = pathname ? /^\/(?:[a-z]{2}\/)?t\/([^/]+)\/?$/.exec(pathname) : null;
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]!);
  } catch {
    return null;
  }
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
