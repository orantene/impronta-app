/**
 * F5: URL hygiene applied to every sitemap the app emits.
 *
 * PURE. Search Console discounts a sitemap that lists redirects, duplicates,
 * query strings or non-canonical forms, and the protocol caps one file at
 * 50,000 URLs. This is the last pass before the XML is written:
 *   - only absolute http(s) URLs;
 *   - no query string or fragment (a sitemap lists canonical URLs only);
 *   - no trailing slash except the site root, so `/pricing` and `/pricing/`
 *     are one entry, not two;
 *   - private surfaces never listed (api, auth, dashboards, previews);
 *   - duplicates collapse to one entry, keeping the newest `lastModified` and
 *     the union of `alternates.languages`;
 *   - capped at 50,000.
 * Every dropped or merged entry is counted so a regression is visible.
 */
import type { MetadataRoute } from "next";

export const SITEMAP_MAX_URLS = 50_000;

/** Path prefixes that are never public pages (matched on whole path segments). */
const PRIVATE_PREFIXES = ["/api", "/_next", "/login", "/auth", "/admin", "/talent", "/client", "/platform", "/dev", "/preview", "/review", "/manage"];

export type SitemapHygieneReport = {
  kept: number;
  droppedInvalid: number;
  droppedPrivate: number;
  merged: number;
  truncated: number;
};

type Entry = MetadataRoute.Sitemap[number];

/** Canonical form of one URL, or null when it must not be listed. */
export function canonicalSitemapUrl(raw: string): { url: string; private: boolean } | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  let path = u.pathname.replace(/\/{2,}/g, "/");
  if (path.length > 1) path = path.replace(/\/+$/, "");
  const isPrivate = PRIVATE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
  const origin = `${u.protocol}//${u.host}`;
  return { url: path === "/" ? `${origin}/` : `${origin}${path}`, private: isPrivate };
}

function newest(a: Entry["lastModified"], b: Entry["lastModified"]): Entry["lastModified"] {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

export function cleanSitemapEntries(
  entries: MetadataRoute.Sitemap,
  max: number = SITEMAP_MAX_URLS,
): { entries: MetadataRoute.Sitemap; report: SitemapHygieneReport } {
  const report: SitemapHygieneReport = { kept: 0, droppedInvalid: 0, droppedPrivate: 0, merged: 0, truncated: 0 };
  const byUrl = new Map<string, Entry>();
  for (const e of entries) {
    const c = canonicalSitemapUrl(e.url);
    if (!c) {
      report.droppedInvalid += 1;
      continue;
    }
    if (c.private) {
      report.droppedPrivate += 1;
      continue;
    }
    const alternates = e.alternates?.languages
      ? {
          languages: Object.fromEntries(
            Object.entries(e.alternates.languages)
              .map(([lang, href]) => [lang, href ? (canonicalSitemapUrl(href)?.url ?? null) : null] as const)
              .filter((p): p is readonly [string, string] => p[1] !== null),
          ),
        }
      : undefined;
    const cleaned: Entry = { ...e, url: c.url, ...(alternates ? { alternates } : {}) };
    const prev = byUrl.get(c.url);
    if (!prev) {
      byUrl.set(c.url, cleaned);
      continue;
    }
    report.merged += 1;
    byUrl.set(c.url, {
      ...prev,
      lastModified: newest(prev.lastModified, cleaned.lastModified),
      alternates: prev.alternates || cleaned.alternates
        ? { languages: { ...(prev.alternates?.languages ?? {}), ...(cleaned.alternates?.languages ?? {}) } }
        : undefined,
    });
  }
  let out = [...byUrl.values()];
  if (out.length > max) {
    report.truncated = out.length - max;
    out = out.slice(0, max);
  }
  report.kept = out.length;
  return { entries: out, report };
}
