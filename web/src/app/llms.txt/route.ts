/**
 * `/llms.txt` (Posts v1, TUL-1010) — per site, host-aware.
 *
 *   agency host      → the workspace site's indexable posts
 *   talent_site host → the talent site's indexable posts
 *   marketing host   → the platform llms.txt (`/api/llms`, TUL-589)
 *   anything else    → 404
 *   AI toggle OFF ("IA puede leer mi sitio", `ai_crawlers_allowed = false`) → 404
 *
 * Only INDEXABLE posts are listed (no unlisted, expired, taken-down or
 * noindex rows): see `buildLlmsTxt` / `isIndexablePost`.
 */
import { GET as marketingOrTalentLlms } from "@/app/api/llms/route";
import { buildLlmsTxt } from "@/lib/cms/posts-public-model";
import { listPublishedPostRows } from "@/lib/cms/posts-public";
import { loadAiCrawlersAllowed, postSiteUrlFor, resolveAnyPostSite } from "@/lib/cms/posts-public-site";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const site = await resolveAnyPostSite().catch(() => null);
  // Not an agency or talent post site (the marketing host, TUL-589): hand off to the platform llms.txt
  // handler. A filesystem route beats the next.config rewrite to /api/llms, so without this hand-off the
  // marketing host answered a bare "Not found" (QA Batch 18). That handler still 404s every other host.
  if (!site) return marketingOrTalentLlms();
  const allowed = await loadAiCrawlersAllowed(site.scope).catch(() => true);
  if (!allowed) return new Response("Not found", { status: 404, headers: { "X-Robots-Tag": "noindex" } });
  const urlFor = postSiteUrlFor(site);
  const rows = await listPublishedPostRows(site.scope, site.supportedLocales).catch(() => []);
  const body = buildLlmsTxt({
    siteName: site.siteName,
    homeUrl: urlFor("/", site.defaultLocale),
    posts: rows,
    urlFor,
    now: new Date(),
  });
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=3600",
    },
  });
}
