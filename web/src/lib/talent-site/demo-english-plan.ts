/**
 * Pure plan for the five demos whose `/en` used to 404 (TUL-516 B1 / was TUL-488).
 *
 * Those demos stay Spanish-only in site settings. Enabling `secondary_locales`
 * without English chrome overlays would leak Spanish on `/en`. The host now
 * serves an explicit single-language notice instead, so this plan never enables
 * English on the allow-list.
 */
export const DEMO_ENGLISH_SLUGS = ["karla-beltran", "diego-navarro-dj", "saul-tapia-ortega", "tomas-retratos", "valeria-baila"] as const;

export type DemoEnglishRow = { slug: string; id: string; isDemo: boolean; preferred: string | null; secondary: string[] };
export type DemoEnglishPlan =
  | { action: "enable"; slug: string; id: string; before: string[]; after: string[] }
  | { action: "skip"; slug: string; id: string; reason: string };

export function planDemoEnglish(rows: DemoEnglishRow[]): DemoEnglishPlan[] {
  const allowed = new Set<string>(DEMO_ENGLISH_SLUGS);
  return rows.map((r) => {
    if (!allowed.has(r.slug)) return { action: "skip", slug: r.slug, id: r.id, reason: "not on the allow-list" } as const;
    if (!r.isDemo) return { action: "skip", slug: r.slug, id: r.id, reason: "not a demo profile" } as const;
    // TUL-516 B1: keep Spanish-only; `/en` shows an explicit notice.
    return {
      action: "skip",
      slug: r.slug,
      id: r.id,
      reason: "spanish-only: /en shows an explicit notice (TUL-516 B1)",
    } as const;
  });
}
