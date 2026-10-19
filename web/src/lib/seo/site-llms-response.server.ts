import "server-only";

import { buildLlmsTxt, llmsPostLinks } from "@/lib/cms/posts-public-model";
import { listPublishedPostRows } from "@/lib/cms/posts-public";
import { loadAiCrawlersAllowed, postSiteUrlFor, type PostSiteContext } from "@/lib/cms/posts-public-site";
import { loadTalentLlmsTxt } from "./talent-llms-txt.server";

/**
 * THE llms.txt response for a resolved agency or talent site (A6, TUL-1273). Both `/llms.txt` and
 * `/api/llms` call this, so the AI toggle ("IA puede leer mi sitio") and the posts list apply on every path.
 * Talent sites: services, prices, posts and the public booking endpoints. Workspace (agency) sites stay
 * posts-only; a services section for them is out of scope here and moves to F2.
 */
export async function siteLlmsResponse(site: PostSiteContext): Promise<Response> {
  const allowed = await loadAiCrawlersAllowed(site.scope).catch(() => true);
  if (!allowed) return new Response("Not found", { status: 404, headers: { "X-Robots-Tag": "noindex" } });
  const urlFor = postSiteUrlFor(site);
  const rows = await listPublishedPostRows(site.scope, site.supportedLocales).catch(() => []);
  const headers = {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=3600",
  };
  if (site.scope.kind === "talent") {
    const talentBody = await loadTalentLlmsTxt(
      site.scope.talentProfileId,
      new URL(site.origin),
      llmsPostLinks(rows, urlFor, new Date()),
    );
    if (talentBody) return new Response(talentBody, { status: 200, headers });
  }
  const body = buildLlmsTxt({
    siteName: site.siteName,
    homeUrl: urlFor("/", site.defaultLocale),
    posts: rows,
    urlFor,
    now: new Date(),
  });
  return new Response(body, { status: 200, headers });
}
