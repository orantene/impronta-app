import { isChangelogLive, loadChangelogRows, viewEntries, type ChangelogEntryView, type ChangelogLocale } from "@/lib/changelog/public-read";
import { changelogOrigin } from "@/lib/changelog/request-origin";
import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { publicOrigin } from "@/lib/storefront/request-context";

/** RSS 2.0 for the changelog (TUL-1394). Pattern: /resources/feed.xml. */

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildChangelogFeed(entries: readonly ChangelogEntryView[], locale: ChangelogLocale, base: string): string {
  const es = locale === "es";
  const indexUrl = `${base}${es ? "/es/novedades" : "/changelog"}`;
  const title = es ? `${PLATFORM_BRAND.name} · Novedades` : `${PLATFORM_BRAND.name} · What's new`;
  const description = es
    ? "Las mejoras semanales de Tulala, con cómo usarlas."
    : "Weekly Tulala improvements and how to use them.";
  const items = entries
    .map((e) => {
      const url = `${base}${es ? "/es/novedades" : "/changelog"}/${e.id}`;
      const t = Date.parse(e.date ?? "");
      const pub = Number.isFinite(t) ? `\n      <pubDate>${new Date(t).toUTCString()}</pubDate>` : "";
      return `    <item>
      <title>${escapeXml(e.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>${pub}
      <description>${escapeXml(e.summary)}</description>
    </item>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(indexUrl)}</link>
    <description>${escapeXml(description)}</description>
    <language>${es ? "es" : "en"}</language>
    <atom:link href="${escapeXml(`${indexUrl}/feed.xml`)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
}

export async function changelogFeedResponse(locale: ChangelogLocale): Promise<Response> {
  const base = changelogOrigin(await publicOrigin());
  const entries = viewEntries(await loadChangelogRows(), locale);
  return new Response(buildChangelogFeed(entries, locale, base), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      // Stays out of search until the public launch, like the pages.
      "X-Robots-Tag": (await isChangelogLive()) ? "all" : "noindex",
    },
  });
}
