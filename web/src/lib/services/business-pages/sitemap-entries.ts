/**
 * Sitemap entries for business service pages (TUL-1272 #5): `/services/<slug>`
 * and `/es/servicios/<slug>` (the tenant's own grammar decides the prefix), one
 * entry per supported locale with hreflang alternates.
 *
 * Kept out of `app/sitemap.ts` (several open PRs edit it): that file only
 * imports `loadBusinessServiceSitemapEntries` and appends the result.
 * Listed: guest-sellable rows only (published + approved + public), and only
 * while the flag is on and the plan has own pages.
 */
import type { MetadataRoute } from "next";
import type { SupabaseClient } from "@supabase/supabase-js";

import { buildLocaleAlternates } from "@/i18n/alternates";

import { businessServicePagesOn, loadBusinessServiceRows } from "./load.server";
import { businessServicePathWithoutLocale, businessServiceSlug } from "./paths";

export type BusinessServiceSitemapRow = { id: string; title: string; updatedAt: string | null };

export function businessServiceSitemapEntries(
  rows: readonly BusinessServiceSitemapRow[],
  opts: { origin: string | URL; defaultLocale: string; supportedLocales: readonly string[]; pathPrefix?: string; now: Date },
): MetadataRoute.Sitemap {
  const out: MetadataRoute.Sitemap = [];
  for (const row of rows) {
    if (!row.title.trim()) continue;
    const slug = businessServiceSlug(row);
    const modified = row.updatedAt ? new Date(row.updatedAt) : opts.now;
    const lastModified = Number.isNaN(modified.getTime()) ? opts.now : modified;
    for (const locale of opts.supportedLocales) {
      const alt = buildLocaleAlternates({
        origin: opts.origin,
        pathnameWithoutLocale: businessServicePathWithoutLocale(locale, slug),
        pathnameForLocale: (code) => businessServicePathWithoutLocale(code, slug),
        currentLocale: locale,
        defaultLocale: opts.defaultLocale,
        supportedLocales: opts.supportedLocales,
        ...(opts.pathPrefix ? { pathPrefix: opts.pathPrefix } : {}),
      });
      out.push({ url: alt.canonical, lastModified, ...(alt.languages ? { alternates: { languages: alt.languages } } : {}) });
    }
  }
  return out;
}

/** Never throws: any failure lists nothing. */
export async function loadBusinessServiceSitemapEntries(input: {
  supabase: SupabaseClient;
  tenantId: string;
  origin: string | URL;
  defaultLocale: string;
  supportedLocales: readonly string[];
  now?: Date;
  flagOn?: boolean;
}): Promise<MetadataRoute.Sitemap> {
  try {
    if (!(await businessServicePagesOn(input.supabase, input.tenantId, input.flagOn))) return [];
    const loaded = await loadBusinessServiceRows(input.supabase, input.tenantId, { publicOnly: true });
    if (!loaded) return [];
    return businessServiceSitemapEntries(
      loaded.rows.map((r) => ({
        id: String(r.id),
        title: String(r.title ?? ""),
        updatedAt: ((r as { updated_at?: string | null }).updated_at ?? null) as string | null,
      })),
      { origin: input.origin, defaultLocale: input.defaultLocale, supportedLocales: input.supportedLocales, now: input.now ?? new Date() },
    );
  } catch {
    return [];
  }
}
