/**
 * Origin resolution for everything the app publishes to crawlers: canonical
 * links, hreflang alternates, sitemap entries, robots directives.
 *
 * This module is deliberately a leaf (no imports from other `lib/seo` files) so
 * `request-base.ts` and `locale-alternates.ts` can both build on it without a
 * module cycle.
 */

import type { PublicHostContext } from "@/lib/saas/scope";

/**
 * The fixed platform origin (`NEXT_PUBLIC_SITE_URL`).
 *
 * Correct ONLY for platform-owned surfaces. Never use it for a tenant
 * storefront: a tenant on its own domain that canonicalizes to the platform
 * apex is telling Google it is a duplicate of another site.
 */
export function publicSiteMetadataBase(): URL {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";
  const normalized = raw.endsWith("/") ? raw.slice(0, -1) : raw;
  return new URL(normalized);
}

/**
 * Origin to anchor per-request public URLs (sitemap entries, robots
 * `Sitemap:` / `Host:` directives) to the host actually serving the request.
 *
 * For a tenant storefront — an `agency` or `hub` host with a resolved hostname —
 * this returns the tenant's OWN origin, so a sitemap served at
 * `https://agency.example.com/sitemap.xml` lists `https://agency.example.com/…`
 * URLs. That is a hard prerequisite for Google Search Console, which rejects a
 * sitemap whose URLs live on a different host than the property being verified.
 *
 * For every other surface (marketing / app / talent_site / unknown) it falls
 * back to the fixed platform base — a sitemap has to name SOME origin, so the
 * platform apex is the least-wrong answer there.
 */
export function publicRequestSiteBase(hostContext: PublicHostContext): URL {
  return tenantRequestOrigin(hostContext) ?? publicSiteMetadataBase();
}

/** The tenant's own origin, or null when this host is not a tenant storefront. */
function tenantRequestOrigin(hostContext: PublicHostContext): URL | null {
  if (
    (hostContext.kind === "agency" || hostContext.kind === "hub") &&
    hostContext.hostname
  ) {
    try {
      return new URL(`https://${hostContext.hostname}`);
    } catch {
      // Malformed hostname header — fall through rather than emit a broken
      // origin.
    }
  }
  return null;
}

/**
 * Origin for canonical + hreflang links, or `null` when none can be trusted.
 *
 * Unlike {@link publicRequestSiteBase} this does NOT fall back to the platform
 * apex on an unresolved host. A canonical is a claim about identity: emitting
 * the wrong one is strictly worse than emitting none, because it hands a
 * tenant's pages to another domain (and, when that platform path does not
 * exist, to a 404). Callers that get `null` must omit `alternates` entirely and
 * let the page be indexed under its own URL.
 *
 *  - `agency` / `hub` with a hostname → the tenant's own origin.
 *  - `marketing`                      → the platform apex, which really does
 *                                       own the marketing tree.
 *  - `app` / `talent_site` / `unknown` / hostname-less → `null`. These are
 *    either not indexable surfaces or non-request contexts (build-time metadata
 *    generation), where no host is knowable.
 */
export function publicAlternatesOrigin(
  hostContext: PublicHostContext,
): URL | null {
  const tenantOrigin = tenantRequestOrigin(hostContext);
  if (tenantOrigin) return tenantOrigin;
  if (hostContext.kind === "marketing") return publicSiteMetadataBase();
  return null;
}
