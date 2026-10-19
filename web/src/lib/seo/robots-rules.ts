import type { MetadataRoute } from "next";

/**
 * Pure robots.txt policy, split from `app/robots.ts` so it is unit-testable
 * without request headers.
 *
 * Public, indexable surfaces: marketing, agency storefronts, and talent site
 * hosts (`<name>.<apex>` subdomains and talent custom domains). Everything else
 * (app shell, hub, unknown / unregistered hosts) stays `Disallow: /`.
 */
export const PUBLIC_DISALLOW = ["/api/", "/admin/", "/preview/", "/_vercel/"];

/**
 * TUL-1326 (decision: AI search ON, AI training OFF, one toggle).
 *
 * AI TRAINING crawlers: they collect pages to train models, send no visitor
 * back, and are refused on every public host with an explicit `Disallow: /`.
 * (Unlisted, they used to fall into the `*` group and were allowed.)
 */
export const AI_TRAINING_USER_AGENTS = [
  "GPTBot",
  "ClaudeBot",
  "anthropic-ai",
  "Claude-Web",
  "Google-Extended",
  "CCBot",
  "Bytespider",
  "Applebot-Extended",
  "Meta-ExternalAgent",
  "cohere-ai",
  "Diffbot",
  "ImagesiftBot",
  "Omgilibot",
] as const;

/**
 * AI SEARCH / user-initiated agents: they fetch a page to answer a person, so
 * they are allowed on public pages, llms.txt AND the public read endpoints
 * (`/api/public/`) they exist to read.
 */
export const AI_ANSWER_USER_AGENTS = [
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "Claude-SearchBot",
  "Claude-User",
] as const;

/** Answer agents plus the two classic search engines, named so a host is unambiguously open. */
export const AI_SEARCH_USER_AGENTS = [...AI_ANSWER_USER_AGENTS, "Googlebot", "Bingbot"] as const;

/**
 * THE one list of AI bots, shared by robots.txt and the per-site toggle: when
 * "IA puede leer mi sitio" is OFF every one of these is refused. (Googlebot and
 * Bingbot are ordinary search and are never part of the AI toggle.)
 */
export const AI_CRAWLER_USER_AGENTS = [...AI_TRAINING_USER_AGENTS, ...AI_ANSWER_USER_AGENTS] as const;

/** The public read endpoints answer agents may use (catalog, markdown, slots). */
export const AI_PUBLIC_API_ALLOW = "/api/public/";

const INDEXABLE_KINDS = new Set(["marketing", "agency", "talent_site"]);

export function isIndexableHostKind(kind: string): boolean {
  return INDEXABLE_KINDS.has(kind);
}

/**
 * TUL-857: only a production deploy may be indexed. Vercel preview / staging
 * builds (`VERCEL_ENV=preview`) serve tenant hosts too, and must never be
 * crawlable. Unset (local dev, tests) keeps the production behaviour.
 */
export function isNonProductionDeploy(vercelEnv: string | undefined): boolean {
  return vercelEnv === "preview" || vercelEnv === "development";
}

export function buildRobots(
  kind: string,
  base: URL,
  opts: { nonProduction?: boolean } = {},
): MetadataRoute.Robots {
  if (opts.nonProduction || !isIndexableHostKind(kind)) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: PUBLIC_DISALLOW,
      },
      {
        // `/api/public/` is longer than `/api/`, so for these agents the public
        // read endpoints stay open while the rest of /api/ stays closed.
        userAgent: [...AI_SEARCH_USER_AGENTS],
        allow: ["/", AI_PUBLIC_API_ALLOW],
        disallow: PUBLIC_DISALLOW,
      },
      { userAgent: [...AI_TRAINING_USER_AGENTS], disallow: "/" },
    ],
    sitemap: new URL("/sitemap.xml", base).toString(),
    host: base.host,
  };
}
