/**
 * The finished Spanish-primary demos (Maison v2, Folio, Gridline) also publish an
 * English site when their site languages include English. Their
 * `preferred_locale` is `es`; the English page exists only when
 * `talent_profiles.secondary_locales` contains `en`.
 *
 * TUL-516 B1: Spanish-only demos (siteLangs without `en`) stay single-language
 * and get an explicit notice on `/en` instead of a silent redirect or a leaked
 * EN pill. Pure. Used by the demo seed (seed.mts) and the live-demo script
 * (scripts/demo-english-data/finished-demos-en.ts).
 */

/** Live Design slugs of the finished demos that may ship an English page. */
export const FINISHED_DEMO_THEMES: readonly string[] = ["maison-v2", "folio", "gridline"];

/** The secondary locales a finished Spanish-primary bilingual demo gets (add-only). */
export const FINISHED_DEMO_SECONDARY: readonly string[] = ["en"];

/**
 * The `secondary_locales` to write for a demo, or null to leave the row alone.
 * Only a Spanish-primary demo on a finished theme whose secondary list is empty
 * and whose site languages include English gets `en`.
 */
export function finishedDemoSecondaryLocales(input: {
  theme: string;
  preferredLocale: string | null | undefined;
  currentSecondary: readonly string[] | null | undefined;
  /** When set, English is enabled only if this list includes `en` (TUL-516 B1). */
  siteLangs?: readonly string[] | null;
}): string[] | null {
  if (!FINISHED_DEMO_THEMES.includes(input.theme)) return null;
  if ((input.preferredLocale ?? "es") !== "es") return null;
  if ((input.currentSecondary ?? []).length > 0) return null;
  if (input.siteLangs != null && !input.siteLangs.includes("en")) return null;
  return [...FINISHED_DEMO_SECONDARY];
}
