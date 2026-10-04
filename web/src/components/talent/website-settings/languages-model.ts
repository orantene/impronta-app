/**
 * Website settings > Languages: the pure model (PR 7). No React.
 *
 * The talent picks ONE primary (their dashboard, site default and search
 * listing) and may also offer the site in other live languages. v1 live set is
 * ES + EN; FR / PT / DE are shown as "Coming soon" (data, not code: moving one
 * to LIVE_SITE_LOCALES is the whole change once the platform publishes it).
 */

export const LIVE_SITE_LOCALES = ["es", "en"] as const;
export const COMING_SOON_LOCALES = ["fr", "pt", "de"] as const;

export type LanguagesDraft = {
  primary: string;
  secondary: string[];
};

function same(a: readonly string[], b: readonly string[]): boolean {
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
}

/** Unsaved-change count for the screen's chip: primary counts 1, each secondary flip 1. */
export function languagesChangeCount(saved: LanguagesDraft | null, draft: LanguagesDraft | null): number {
  if (!saved || !draft) return 0;
  let n = saved.primary === draft.primary ? 0 : 1;
  if (!same(saved.secondary, draft.secondary)) {
    const all = new Set([...saved.secondary, ...draft.secondary]);
    for (const code of all) if (saved.secondary.includes(code) !== draft.secondary.includes(code)) n += 1;
  }
  return n;
}

/** Pick a primary: the secondary set drops it, so a language is never both. */
export function withPrimary(draft: LanguagesDraft, primary: string): LanguagesDraft {
  return { primary, secondary: draft.secondary.filter((l) => l !== primary) };
}

/** Toggle a secondary language (never the primary). */
export function toggleSecondary(draft: LanguagesDraft, code: string, on: boolean): LanguagesDraft {
  if (code === draft.primary) return draft;
  const rest = draft.secondary.filter((l) => l !== code);
  return { ...draft, secondary: on ? [...rest, code] : rest };
}

/** Which secondaries a save adds / removes (drives the toast and confirm copy). */
export function secondaryDelta(
  saved: LanguagesDraft,
  draft: LanguagesDraft,
): { added: string[]; removed: string[] } {
  return {
    added: draft.secondary.filter((l) => !saved.secondary.includes(l)),
    removed: saved.secondary.filter((l) => !draft.secondary.includes(l)),
  };
}

/**
 * Suggested primary when nothing is stored: the first live locale in the
 * browser's language list, else the one for the country, else null.
 */
export function suggestPrimary(
  browserLanguages: readonly string[],
  countryLanguage: string | null,
  live: readonly string[] = LIVE_SITE_LOCALES,
): string | null {
  for (const tag of browserLanguages) {
    const base = tag.toLowerCase().split("-")[0] ?? "";
    if (live.includes(base)) return base;
  }
  return countryLanguage && live.includes(countryLanguage) ? countryLanguage : null;
}
