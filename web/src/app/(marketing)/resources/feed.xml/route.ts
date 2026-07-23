import { withLocalePath } from "@/i18n/pathnames";
import { getRequestLocale } from "@/i18n/request-locale";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { getArticleContent, RESOURCE_ARTICLES } from "@/lib/marketing/resources";
import { PLATFORM_BRAND } from "@/lib/platform/brand";

/**
 * RSS 2.0 feed for the resources library (`/resources/feed.xml`).
 *
 * A real syndication asset: feed readers, newsletter aggregators, and the
 * crawlers that fetch feeds rather than HTML all consume this. It is generated
 * from the same `RESOURCE_ARTICLES` data the hub, the article pages, and the
 * sitemap read, so adding an article stays a single data edit.
 *
 * Locale: the feed follows the resolved request locale exactly like every
 * marketing page, so `/es/resources/feed.xml` (and a visitor whose locale is
 * Spanish) gets the Spanish titles, descriptions, and item links.
 *
 * Reachability: the marketing surface allow-list permits the whole `/resources`
 * prefix (`MARKETING_PAGE_PREFIXES`), and `hasPrefix` matches any path under it,
 * so this route passes the host gate without an allow-list edit. Non-marketing
 * hosts 404 it in middleware, which is correct: the resources library is a
 * platform surface, not tenant content.
 */

/** Reads request headers/cookies for the locale, so never prerender it. */
export const dynamic = "force-dynamic";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** RFC 822 date, the format RSS requires. Returns null for an unparsable date. */
function toRfc822(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toUTCString();
}

function sortKey(value: string): number {
  const time = new Date(value).getTime();
  // An unparsable date sorts last rather than throwing the whole feed off.
  return Number.isNaN(time) ? 0 : time;
}

export async function GET() {
  const locale = await getRequestLocale();
  const base = `https://${PLATFORM_BRAND.domain}`;
  const feedPath = withLocalePath("/resources/feed.xml", locale);
  const hubPath = withLocalePath("/resources", locale);

  const channel = pickLocale(locale, {
    en: {
      title: `${PLATFORM_BRAND.name} · Resources for independent talent`,
      description:
        "Plain-language guides on getting booked, taking deposits, pricing your work, and running the business side of independent talent.",
      language: "en",
    },
    es: {
      title: `${PLATFORM_BRAND.name} · Recursos para talento independiente`,
      description:
        "Guías claras sobre cómo te contratan, cobrar anticipos, poner precio a tu trabajo y llevar el lado de negocio del talento independiente.",
      language: "es",
    },
  });

  // Newest first. Array#sort is stable, so articles published the same day keep
  // the order they carry in the content model.
  const articles = [...RESOURCE_ARTICLES].sort(
    (a, b) => sortKey(b.datePublished) - sortKey(a.datePublished),
  );

  const items = articles.map((article) => {
    const content = getArticleContent(article, locale);
    const url = `${base}${withLocalePath(`/resources/${article.slug}`, locale)}`;
    const pubDate = toRfc822(article.datePublished);
    return [
      "    <item>",
      `      <title>${escapeXml(content.title)}</title>`,
      `      <link>${escapeXml(url)}</link>`,
      `      <description>${escapeXml(content.subtitle)}</description>`,
      `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
      ...(pubDate ? [`      <pubDate>${pubDate}</pubDate>`] : []),
      "    </item>",
    ].join("\n");
  });

  // The newest article's date, not "now": the feed only changes when an article
  // does, and claiming a fresh build on every poll would be a lie to readers.
  const lastBuildDate = articles.length
    ? toRfc822(articles[0].datePublished)
    : null;

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(channel.title)}</title>`,
    `    <link>${escapeXml(`${base}${hubPath}`)}</link>`,
    `    <description>${escapeXml(channel.description)}</description>`,
    `    <language>${channel.language}</language>`,
    `    <atom:link href="${escapeXml(`${base}${feedPath}`)}" rel="self" type="application/rss+xml" />`,
    ...(lastBuildDate ? [`    <lastBuildDate>${lastBuildDate}</lastBuildDate>`] : []),
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      // Content varies with the resolved locale, so let readers revalidate
      // rather than pinning a language variant in a shared cache.
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
