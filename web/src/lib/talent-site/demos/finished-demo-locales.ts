/**
 * The finished Spanish-primary demos (Maison v2, Folio, Gridline) also publish an
 * English site. Their `preferred_locale` is `es`; the English page exists only
 * when `talent_profiles.secondary_locales` contains `en`, otherwise `/en` is the
 * branded 404 of a single-language site.
 *
 * Pure. Used by the demo seed (seed.mts) and the live-demo script
 * (scripts/demo-english-data/finished-demos-en.ts) so both decide the same way.
 * Demos whose own language is English, and the older themes, are not touched.
 */

/** Live Design slugs of the finished demos that ship an English page. */
export const FINISHED_DEMO_THEMES: readonly string[] = ["maison-v2", "folio", "gridline"];

/** The secondary locales a finished Spanish-primary demo gets (add-only). */
export const FINISHED_DEMO_SECONDARY: readonly string[] = ["en"];

/**
 * The `secondary_locales` to write for a demo, or null to leave the row alone.
 * Only a Spanish-primary demo on a finished theme whose secondary list is empty
 * gets `en`; any list a person already set is kept as it is.
 */
export function finishedDemoSecondaryLocales(input: {
  theme: string;
  preferredLocale: string | null | undefined;
  currentSecondary: readonly string[] | null | undefined;
}): string[] | null {
  if (!FINISHED_DEMO_THEMES.includes(input.theme)) return null;
  if ((input.preferredLocale ?? "es") !== "es") return null;
  if ((input.currentSecondary ?? []).length > 0) return null;
  return [...FINISHED_DEMO_SECONDARY];
}
