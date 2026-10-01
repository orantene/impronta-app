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

type NameMap = Readonly<Record<string, string | null | undefined>> | null | undefined;

/**
 * The best spelling of `label` in `locale` among the canonical location maps
 * that share its slug: the locale's own name, then any accented variant, then
 * the label unchanged. Never returns a different city.
 */
export function canonicalCityName(label: string, maps: ReadonlyArray<NameMap>, locale: string): string {
  const text = label.trim();
  if (!text) return text;
  const lang = locale.trim().toLowerCase().slice(0, 2) || "en";
  const slug = citySlug(text);
  const same = (n: string | null | undefined): n is string => !!n?.trim() && citySlug(n) === slug;
  for (const m of maps) {
    const own = m?.[lang];
    if (same(own)) return own.trim();
  }
  for (const m of maps) {
    for (const n of Object.values(m ?? {})) if (same(n) && hasAccent(n)) return n.trim();
  }
  return text;
}
