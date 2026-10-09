/**
 * Locale for starter snapshot tokens (meta description / intro tagline / publicBio).
 *
 * Fresh "myself" sites used to hardcode English for the bio that seeds
 * `metaDescription` and `introTagline`, while the live Maison body followed
 * `preferred_locale` (TUL-411). Pure helpers keep the seed path aligned with
 * the page locale (the talent's primary language at provision time).
 *
 * Rule (TUL-411): meta / tagline follow the PAGE locale. Fall back to the
 * other language (map entry or `short_bio`) only when that page locale has
 * nothing — e.g. English-primary talent with only a Spanish `short_bio` still
 * seeds Spanish when `bio_i18n.en` is empty. Existing sites are healed by the
 * public SEO re-render fallback (#2961), not a data backfill script.
 */

export type StarterLocale = "en" | "es";

/** Normalize `talent_profiles.preferred_locale` (or null) to en|es. Default en. */
export function starterPrimaryLocale(preferred: string | null | undefined): StarterLocale {
  const code = (preferred ?? "").trim().toLowerCase().slice(0, 2);
  return code === "es" ? "es" : "en";
}

/**
 * Bio that seeds starter `publicBio` / meta / intro tagline for the page locale.
 *
 * Precedence: page-locale map → `short_bio` → other locale map → any map value.
 * Never English-first when the page locale is Spanish. When the page locale is
 * English and only a Spanish `short_bio` exists, that Spanish text is the
 * intentional fallback (page locale had nothing).
 */
export function pickStarterBio(
  map: Readonly<Record<string, string>>,
  primary: StarterLocale,
  shortBio: string | null | undefined,
): string {
  const fromPrimary = (map[primary] ?? "").trim();
  if (fromPrimary) return fromPrimary;
  const short = (shortBio ?? "").trim();
  if (short) return short;
  const other: StarterLocale = primary === "es" ? "en" : "es";
  const fromOther = (map[other] ?? "").trim();
  if (fromOther) return fromOther;
  for (const v of Object.values(map)) {
    const t = (v ?? "").trim();
    if (t) return t;
  }
  return "";
}

/** Label from an i18n map for the starter locale, with sensible fallbacks. */
export function pickStarterI18nLabel(
  map: Readonly<Record<string, string | null>> | null | undefined,
  primary: StarterLocale,
): string | null {
  if (!map) return null;
  const direct = map[primary]?.trim();
  if (direct) return direct;
  const en = map.en?.trim();
  if (en) return en;
  const es = map.es?.trim();
  if (es) return es;
  for (const v of Object.values(map)) {
    const t = typeof v === "string" ? v.trim() : "";
    if (t) return t;
  }
  return null;
}
