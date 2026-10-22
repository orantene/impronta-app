/**
 * Per-language portfolio caption and alt text (#187). Pure, no IO.
 *
 * Media `metadata` (jsonb) carries optional `caption_i18n` / `alt_i18n` maps
 * (`{ es?: string; en?: string; ... }`). The base `metadata.caption` and the
 * `alt` column stay the primary-language value, so a photo without the maps
 * resolves exactly as before. Nothing is ever invented or machine-translated:
 * the walk is visitor locale, then the page's primary locale, then the base.
 */


export type PortfolioI18nMap = Readonly<Record<string, string | null | undefined>>;

function key(locale: string | null | undefined): string {
  return (locale ?? "").trim().toLowerCase().slice(0, 2);
}

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Coerce a jsonb value into a locale map; anything else is "no map". */
export function readPortfolioI18nMap(raw: unknown): PortfolioI18nMap | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as PortfolioI18nMap;
}

/**
 * Visitor locale, then primary locale, then `base`. Returns null when all are
 * empty. `base` is the primary-language single string stored today.
 */
export function resolvePortfolioText(
  map: PortfolioI18nMap | null | undefined,
  base: string | null | undefined,
  locale: string | null | undefined,
  primaryLocale?: string | null,
): string | null {
  const visitor = key(locale);
  if (visitor) {
    const v = text(map?.[visitor]);
    if (v) return v;
  }
  const primary = key(primaryLocale);
  if (primary) {
    const p = text(map?.[primary]);
    if (p) return p;
  }
  return text(base) || null;
}

/** Generic photo label in the visitor's language (never a bare "Portfolio"). */
export function portfolioPhotoFallbackAlt(locale: string | null | undefined): string {
  return key(locale) === "es" ? "Foto del portafolio" : "Portfolio photo";
}

/**
 * GRK-101: demo / CDN asset keys (`f-hero`, `f-d-knit`, `gallery-1`) sometimes
 * land in the `alt` column. Those are storage ids, not descriptions — reject so
 * callers can fall through to caption / name / a localized generic.
 */
export function isAssetSlugAlt(alt: string | null | undefined): boolean {
  const s = text(alt);
  if (!s || s.length > 64 || /\s/.test(s)) return false;
  // kebab/snake token with ≥1 separator; all lowercase letters/digits.
  return /^[a-z0-9]+(?:[-_.][a-z0-9]+)+$/.test(s);
}

/** Return `alt` when it is human copy; otherwise null. */
export function humanImageAlt(alt: string | null | undefined): string | null {
  const s = text(alt);
  if (!s || isAssetSlugAlt(s)) return null;
  return s;
}

const EN_WORDS = new Set([
  "a", "an", "the", "of", "in", "on", "at", "with", "and", "for", "to", "by", "from", "near", "next",
  "man", "men", "woman", "women", "person", "people", "girl", "boy", "standing", "sitting", "wearing",
  "holding", "playing", "smiling", "looking", "walking", "white", "black", "yellow", "green", "red", "blue",
  "shirt", "dress", "table", "room", "street", "city", "mixer", "lights", "his", "her", "is", "are",
]);
const NON_EN_WORDS = new Set([
  "de", "del", "la", "el", "las", "los", "un", "una", "con", "en", "y", "por", "para", "al", "sobre",
  "mujer", "hombre", "persona", "retrato", "foto", "manos", "detalle",
]);

/**
 * TUL-1792: true when a stored alt is plain English prose. Seeded demo photos
 * carry English descriptions in the single `alt` column with no `alt_i18n`;
 * on a Spanish site that text must not be read out. Conservative: needs two
 * English function/descriptor words and no Spanish marker or accented letter.
 */
export function looksEnglishAlt(alt: string | null | undefined): boolean {
  const s = text(alt).toLowerCase();
  if (!s || /[\u00c0-\u024f\u00bf\u00a1]/.test(s)) return false;
  const words = s.split(/[^a-z']+/).filter(Boolean);
  let en = 0;
  for (const w of words) {
    if (NON_EN_WORDS.has(w)) return false;
    if (EN_WORDS.has(w)) en += 1;
  }
  return en >= 2;
}

export function resolvePortfolioCaption(
  metadata: Record<string, unknown> | null | undefined,
  locale: string | null | undefined,
  primaryLocale?: string | null,
): string | null {
  return resolvePortfolioText(
    readPortfolioI18nMap(metadata?.caption_i18n),
    text(metadata?.caption),
    locale,
    primaryLocale,
  );
}

/**
 * Alt text: `alt_i18n`, then the alt column, then the resolved caption, then
 * the generated suggestion, the talent's name, then a generic label in the visitor's language.
 */
export function resolvePortfolioAlt(args: {
  metadata: Record<string, unknown> | null | undefined;
  alt: string | null | undefined;
  caption: string | null;
  displayName?: string | null;
  locale: string | null | undefined;
  primaryLocale?: string | null;
  /** Zero-cost generated alt (TUL-588), used before the bare name. */
  suggested?: string | null;
}): string {
  const altMap = readPortfolioI18nMap(args.metadata?.alt_i18n);
  const visitor = key(args.locale);
  // TUL-1792: the bare `alt` column is the talent's primary-language text. When
  // it is plain English and the visitor reads another language (no alt_i18n
  // entry for them), skip it so the localized suggestion / name is used instead
  // of a hard-coded English description.
  const baseAlt =
    visitor && visitor !== "en" && looksEnglishAlt(args.alt) && !text(altMap?.[visitor])
      ? null
      : args.alt;
  const fromMaps = humanImageAlt(
    resolvePortfolioText(altMap, baseAlt, args.locale, args.primaryLocale),
  );
  return (
    fromMaps ||
    text(args.caption) ||
    text(args.suggested) ||
    text(args.displayName) ||
    portfolioPhotoFallbackAlt(args.locale)
  );
}
