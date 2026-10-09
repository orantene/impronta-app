/**
 * Spanish-primary demos also publish an English site. Their `preferred_locale`
 * is `es`; the English page exists only when `talent_profiles.secondary_locales`
 * contains `en`, otherwise `/en` is treated as a page slug and branded-404s
 * (TUL-488 / TUL-516 S1).
 *
 * Pure. Used by the demo seed (seed.mts), theme rebuild (design-step), and the
 * live-demo script (scripts/demo-english-data/finished-demos-en.ts) so every
 * path decides the same way. English-primary demos are not touched: `/` is
 * already English for them.
 *
 * TUL-516: every Spanish-primary demo ships `/en` — theme no longer gates this.
 * Older themes (frame, solace, …) were left single-language and 404'd on `/en`.
 */

/** Themes that historically went through the finished-demo English pass (docs). */
export const FINISHED_DEMO_THEMES: readonly string[] = ["maison-v2", "folio", "gridline", "frame"];

/** The secondary locales a Spanish-primary demo gets (add-only). */
export const FINISHED_DEMO_SECONDARY: readonly string[] = ["en"];

/**
 * The `secondary_locales` to write for a demo, or null to leave the row alone.
 * Only a Spanish-primary demo whose secondary list is empty gets `en`; any list
 * a person already set is kept as it is. Theme is accepted for callers/tests
 * but no longer required — every Spanish-primary demo must ship `/en`.
 */
export function finishedDemoSecondaryLocales(input: {
  theme?: string;
  preferredLocale: string | null | undefined;
  currentSecondary: readonly string[] | null | undefined;
}): string[] | null {
  if ((input.preferredLocale ?? "es") !== "es") return null;
  if ((input.currentSecondary ?? []).length > 0) return null;
  return [...FINISHED_DEMO_SECONDARY];
}

/**
 * Secondary locales implied by a demo's `siteLangs` (primary first). Used when
 * the rebuild path writes switches from `DEMO_SITE_SETTINGS`.
 */
export function demoSecondaryFromSiteLangs(siteLangs: readonly ("es" | "en")[]): string[] {
  if (siteLangs.length < 2) return [];
  const primary = siteLangs[0];
  const out: ("es" | "en")[] = [];
  for (const lang of siteLangs.slice(1)) {
    if (lang !== primary && !out.includes(lang)) out.push(lang);
  }
  return out;
}
