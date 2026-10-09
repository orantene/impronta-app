/** Pure plan for enabling English on the demo sites whose /en used to 404. */
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
    if (r.preferred === "en" || r.secondary.includes("en")) return { action: "skip", slug: r.slug, id: r.id, reason: "already speaks English" } as const;
    return { action: "enable", slug: r.slug, id: r.id, before: r.secondary, after: [...r.secondary, "en"] } as const;
  });
}
