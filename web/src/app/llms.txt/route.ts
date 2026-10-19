/**
 * `/llms.txt` (Posts v1, TUL-1010) — per site, host-aware.
 *
 *   agency host      → the workspace site's indexable posts
 *   talent_site host → the talent site's indexable posts
 *   marketing host   → the platform llms.txt (`/api/llms`, TUL-589)
 *   anything else    → 404
 *   AI toggle OFF ("IA puede leer mi sitio", `ai_crawlers_allowed = false`) → 404
 *
 * Talent hosts get the single talent composer (services, prices, posts, booking endpoints).
 *
 * Only INDEXABLE posts are listed (no unlisted, expired, taken-down or
 * noindex rows): see `buildLlmsTxt` / `isIndexablePost`.
 */
import { GET as marketingOrTalentLlms } from "@/app/api/llms/route";
import { resolveAnyPostSite } from "@/lib/cms/posts-public-site";
import { siteLlmsResponse } from "@/lib/seo/site-llms-response.server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const site = await resolveAnyPostSite().catch(() => null);
  // Not an agency or talent post site (the marketing host, TUL-589): hand off to the platform llms.txt
  // handler. A filesystem route beats the next.config rewrite to /api/llms, so without this hand-off the
  // marketing host answered a bare "Not found" (QA Batch 18). That handler still 404s every other host.
  if (!site) return marketingOrTalentLlms();
  return siteLlmsResponse(site);
}
