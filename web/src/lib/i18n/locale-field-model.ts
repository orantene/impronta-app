/**
 * Locale field model (PR 7, talent languages UI).
 *
 * Pure helpers behind every translatable input: the dashboard `<LocaleField>`,
 * the page builder's `LocaleFieldTabs`, and the Website settings coverage line.
 * No React, no IO. N-language by construction: a language is data here.
 *
 * Status of one locale for one field:
 *   filled    the locale has text
 *   missing   the locale is empty (red ring)
 *   outdated  the locale has text but the primary changed after it was written
 *             (amber ring); only knowable client-side, see `outdatedLocales`.
 */
import type { LocalizedMap } from "./resolve-localized";

export type LocaleStatus = "filled" | "missing" | "outdated";

function clean(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Primary first, then each secondary once (primary and blanks dropped). */
export function orderLocales(primary: string, secondary: readonly string[] = []): string[] {
  const out: string[] = [primary];
  for (const code of secondary) {
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}

/** Status of `locale` in `map`. `outdated` lists locales flagged outdated. */
export function localeStatus(
  map: LocalizedMap | null | undefined,
  locale: string,
  outdated: readonly string[] = [],
): LocaleStatus {
  if (!clean(map?.[locale])) return "missing";
  return outdated.includes(locale) ? "outdated" : "filled";
}

/**
 * Native placeholder for the input on `locale`: the primary text when editing a
 * secondary (a ghost the typing overwrites), otherwise the caller's fallback.
 * Never used as a VALUE: a fallback is never pre-filled.
 */
export function ghostPlaceholder(
  map: LocalizedMap | null | undefined,
  locale: string,
  primary: string,
  fallback = "",
): string {
  if (locale === primary) return fallback;
  return clean(map?.[primary]) || fallback;
}

/**
 * Secondaries whose text is now stale: the primary text differs from where it
 * started (`initial`), and the secondary still holds the text it started with.
 * A secondary edited in this session (by hand or by AI) is current again.
 */
export function outdatedLocales(
  initial: LocalizedMap | null | undefined,
  current: LocalizedMap | null | undefined,
  primary: string,
  locales: readonly string[],
): string[] {
  if (clean(initial?.[primary]) === clean(current?.[primary])) return [];
  if (!clean(initial?.[primary])) return [];
  return locales.filter(
    (code) =>
      code !== primary &&
      clean(current?.[code]) !== "" &&
      clean(current?.[code]) === clean(initial?.[code]),
  );
}

/**
 * Whether the AI button may run for `target`: the source (primary) text is not
 * empty, and the target is empty, outdated, or the source changed since the
 * last AI run for that target.
 */
export function canAiTranslate(input: {
  source: string | null | undefined;
  target: string | null | undefined;
  lastSource?: string | null;
  outdated?: boolean;
}): boolean {
  const source = clean(input.source);
  if (!source) return false;
  if (!clean(input.target)) return true;
  if (input.outdated) return true;
  return typeof input.lastSource === "string" && clean(input.lastSource) !== source;
}

/**
 * The locale the AI button translates INTO: the active tab when it is a
 * secondary, else the first missing / outdated secondary, else the first one.
 * Null for a single-language field.
 */
export function pickAiTarget(
  locales: readonly string[],
  primary: string,
  active: string,
  map: LocalizedMap | null | undefined,
  outdated: readonly string[] = [],
): string | null {
  const secondaries = locales.filter((l) => l !== primary);
  if (secondaries.length === 0) return null;
  if (active !== primary && secondaries.includes(active)) return active;
  const gap = secondaries.find((l) => localeStatus(map, l, outdated) !== "filled");
  return gap ?? secondaries[0] ?? null;
}

/** Roving-tabindex step: Left / Right (and Home / End) over `count` tabs. */
export function nextTabIndex(current: number, key: string, count: number): number {
  if (count <= 0) return 0;
  if (key === "ArrowRight") return (current + 1) % count;
  if (key === "ArrowLeft") return (current - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return current;
}

const LANGUAGE_NAMES: Record<string, { en: string; es: string }> = {
  en: { en: "English", es: "inglés" },
  es: { en: "Spanish", es: "español" },
  fr: { en: "French", es: "francés" },
  pt: { en: "Portuguese", es: "portugués" },
  de: { en: "German", es: "alemán" },
  it: { en: "Italian", es: "italiano" },
};

/**
 * A language's name in the dashboard language: "English" / "inglés". Spanish
 * names are lower case mid-sentence; use `capitalize` for a label start.
 */
export function languageName(code: string, uiLocale: string, capitalize = false): string {
  const row = LANGUAGE_NAMES[code];
  const name = row ? (uiLocale.startsWith("es") ? row.es : row.en) : code.toUpperCase();
  return capitalize ? name.charAt(0).toUpperCase() + name.slice(1) : name;
}

/** Count of fields with text for `locale` over a list of maps (coverage line). */
export function countTranslated(
  maps: ReadonlyArray<LocalizedMap | null | undefined>,
  locale: string,
): { translated: number; total: number } {
  let translated = 0;
  for (const m of maps) if (clean(m?.[locale])) translated += 1;
  return { translated, total: maps.length };
}
