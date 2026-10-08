/**
 * The <title> of a talent site in a language the talent has not written a title for.
 *
 * Found on book-jorgelina /en after 7b: `meta_title` (the primary-language text, Spanish) was shown to
 * English visitors because `meta_title_i18n.en` is empty. Never translate her words; build a neutral
 * title from STRUCTURED fields instead: "{display name} · {city}" (just the name when there is no city).
 * Pure.
 */

function key(locale: string | null | undefined): string {
  return (locale ?? "").trim().toLowerCase().slice(0, 2);
}

/** True when the visitor's language has its own written SEO title (or title) in `*_i18n`. */
export function hasOwnTitleFor(
  maps: ReadonlyArray<Readonly<Record<string, string>> | null | undefined>,
  locale: string,
): boolean {
  const k = key(locale);
  return maps.some((m) => typeof m?.[k] === "string" && m[k]!.trim().length > 0);
}

/**
 * The generated title, or null when the stored title should be used: no two-language setup, the
 * visitor is on the primary language, the visitor's language has a written title, or there is no name.
 */
export function seoTitleFallback(args: {
  locale: string;
  primaryLocale?: string | null;
  metaTitleI18n?: Readonly<Record<string, string>> | null;
  titleI18n?: Readonly<Record<string, string>> | null;
  name?: string | null;
  city?: string | null;
}): string | null {
  const visitor = key(args.locale);
  const primary = key(args.primaryLocale);
  if (!visitor || !primary || visitor === primary) return null;
  if (hasOwnTitleFor([args.metaTitleI18n, args.titleI18n], visitor)) return null;
  const name = args.name?.trim();
  if (!name) return null;
  const city = args.city?.trim();
  return city ? `${name} · ${city}` : name;
}
