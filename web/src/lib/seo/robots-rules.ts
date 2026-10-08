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
 * AI SEARCH / user-initiated agents, named explicitly so a public host is
 * unambiguously open to answer engines. Same rules as `*`. TRAINING crawlers
 * (GPTBot, ClaudeBot, CCBot, Google-Extended, ...) are deliberately NOT listed.
 */
export const AI_SEARCH_USER_AGENTS = [
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "Claude-SearchBot",
  "Claude-User",
  "Googlebot",
  "Bingbot",
] as const;

const INDEXABLE_KINDS = new Set(["marketing", "agency", "talent_site"]);

export function isIndexableHostKind(kind: string): boolean {
  return INDEXABLE_KINDS.has(kind);
}

export function buildRobots(kind: string, base: URL): MetadataRoute.Robots {
  if (!isIndexableHostKind(kind)) {
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
        userAgent: [...AI_SEARCH_USER_AGENTS],
        allow: "/",
        disallow: PUBLIC_DISALLOW,
      },
    ],
    sitemap: new URL("/sitemap.xml", base).toString(),
    host: base.host,
  };
}
