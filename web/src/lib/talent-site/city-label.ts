/**
 * City display names with their accents. A city can reach a talent site as
 * plain text (the drawer's place text, an ASCII-folded places result), so
 * "Cancun" appeared where the `locations` row says "Cancún". The fix is to
 * match the text to the canonical location by its folded slug and prefer the
 * accented spelling. Pure; the lookup lives in `server/city-label.server.ts`.
 */

/** Lowercase, accent-free, hyphenated: the form `locations.slug` uses. */
export function citySlug(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function hasAccent(label: string): boolean {
  return /[^\u0000-\u007f]/.test(label);
}

/**
 * TUL-516: known place names whose English form must not paint on Spanish
 * pages (and the inverse). Used by "Con base en …" swaps and booking-sheet
 * timezone chips so "Mexico City" becomes "Ciudad de México" on ES.
 */
export function localizePlaceCity(city: string, locale: string): string {
  const text = city.trim();
  if (!text) return text;
  const lang = locale.trim().toLowerCase().slice(0, 2) || "en";
  if (lang === "es" && /^mexico\s*city$/i.test(text)) return "Ciudad de México";
  if (lang === "en" && /^ciudad de m[eé]xico$/i.test(text)) return "Mexico City";
  return text;
}

type NameMap = Readonly<Record<string, string | null | undefined>> | null | undefined;

/**
 * The best spelling of `label` in `locale` among the canonical location maps
 * that share its slug (or the hints): an accented spelling if any exists,
 * else the label unchanged. Never returns a different city.
 */
export function canonicalCityName(
  label: string,
  maps: ReadonlyArray<NameMap>,
  locale: string,
  /** Other spellings of the same city (the drawer's place text). */
  hints: ReadonlyArray<string | null | undefined> = [],
): string {
  const text = label.trim();
  if (!text) return text;
  const lang = locale.trim().toLowerCase().slice(0, 2) || "en";
  const slug = citySlug(text);
  const same = (n: string | null | undefined): n is string => !!n?.trim() && citySlug(n) === slug;
  // A location row can itself be ASCII-folded ("Cancun" in both languages) while
  // the talent's place text has the accent, so an accented spelling anywhere wins.
  const all = [...maps.map((m) => m?.[lang]), ...maps.flatMap((m) => Object.values(m ?? {})), ...hints];
  const accented = all.find((n) => same(n) && hasAccent(n!));
  return accented ? accented.trim() : text;
}
