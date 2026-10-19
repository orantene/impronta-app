/**
 * Sitemap entries for the `/blog` index itself (TUL-1003 / TUL-1006): one URL
 * per locale that has at least one INDEXABLE post, with hreflang when two
 * locales qualify. Page 1 only; `?page=n` pages are reached through links and
 * are self-canonical. Pure: `app/sitemap.ts` passes in rows it already read.
 */
import type { MetadataRoute } from "next";

import {
  BLOG_PATH,
  isIndexablePost,
  type LocalizedUrl,
  type PublicPostRow,
} from "@/lib/cms/posts-public-model";

export function blogIndexSitemapEntries(
  rows: readonly PublicPostRow[],
  urlFor: LocalizedUrl,
  now: Date,
): MetadataRoute.Sitemap {
  const byLocale = new Map<string, PublicPostRow[]>();
  for (const row of rows) {
    if (!isIndexablePost(row, now)) continue;
    byLocale.set(row.locale, [...(byLocale.get(row.locale) ?? []), row]);
  }
  const locales = [...byLocale.keys()];
  const languages =
    locales.length > 1 ? Object.fromEntries(locales.map((l) => [l, urlFor(BLOG_PATH, l)])) : null;
  return locales.map((locale) => {
    const stamps = (byLocale.get(locale) ?? [])
      .map((r) => Date.parse(r.updated_at ?? r.published_at ?? ""))
      .filter((t) => !Number.isNaN(t));
    return {
      url: urlFor(BLOG_PATH, locale),
      lastModified: stamps.length ? new Date(Math.max(...stamps)) : now,
      ...(languages ? { alternates: { languages } } : {}),
    };
  });
}
