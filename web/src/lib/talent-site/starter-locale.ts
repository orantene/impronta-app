/**
 * Locale for starter snapshot tokens (meta description / intro tagline / publicBio).
 *
 * Fresh "myself" sites used to hardcode English for the bio that seeds
 * `metaDescription` and `introTagline`, while the live Maison body followed
 * `preferred_locale` (TUL-411). Pure helpers keep the seed path aligned with
 * the talent's primary language.
 */

export type StarterLocale = "en" | "es";

/** Normalize `talent_profiles.preferred_locale` (or null) to en|es. Default en. */
export function starterPrimaryLocale(preferred: string | null | undefined): StarterLocale {
  const code = (preferred ?? "").trim().toLowerCase().slice(0, 2);
  return code === "es" ? "es" : "en";
}

/**
 * Bio that seeds starter `publicBio` / meta / intro tagline.
 * Prefer the primary locale map entry, then `short_bio` (flow language), then
 * any other saved locale — never English-first when primary is Spanish.
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
