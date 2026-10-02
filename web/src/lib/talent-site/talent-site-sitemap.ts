import { isTalentSiteHostPathAllowed } from "@/lib/saas/talent-site-host-routing";
import type { MaxSitePageRow } from "@/lib/talent-site/resolve-max-site-core";

/**
 * Sitemap paths for a talent site HOST (`<name>.<apex>` or a talent custom
 * domain), where pages resolve at the host root (`/` and `/<slug>`).
 *
 * Mirrors what the page route will actually serve, so the manifest never lists
 * a dead link:
 *  - published pages only (`selectMaxSitePage` with `requirePublished`),
 *  - a page flagged `noindex` is left out,
 *  - the home page (the `is_home` row, else the lowest `sort_order`, exactly as
 *    `selectMaxSitePage` resolves a bare URL) is `/`, never `/<its slug>`,
 *  - a slug the host router would not render is dropped.
 *
 * The caller must pass pages already scoped to the talent's plan
 * (`scopeMaxSitePagesToPlan`), and must have passed the public publish gate.
 */
export function talentSiteSitemapPaths(
  pages: readonly Pick<
    MaxSitePageRow,
    "slug" | "isHome" | "status" | "sortOrder" | "noindex"
  >[],
): string[] {
  const published = pages.filter((p) => p.status === "published");
  if (published.length === 0) return [];
  const sorted = [...published].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug),
  );
  const home = published.find((p) => p.isHome) ?? sorted[0];

  const out: string[] = [];
  if (home && home.noindex !== true) out.push("/");
  for (const p of sorted) {
    if (p === home || p.noindex === true) continue;
    const path = `/${encodeURIComponent(p.slug)}`;
    if (isTalentSiteHostPathAllowed(path)?.kind !== "render") continue;
    out.push(path);
  }
  return out;
}
