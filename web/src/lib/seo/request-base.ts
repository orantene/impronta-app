import type { PublicHostContext } from "@/lib/saas/scope";
import { publicSiteMetadataBase } from "@/lib/seo/locale-alternates";

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
 * back to the fixed platform base (`NEXT_PUBLIC_SITE_URL`) — byte-identical to
 * the previous `publicSiteMetadataBase()` behaviour, so off-tenant output is
 * unchanged.
 */
export function publicRequestSiteBase(hostContext: PublicHostContext): URL {
  if (
    (hostContext.kind === "agency" || hostContext.kind === "hub") &&
    hostContext.hostname
  ) {
    try {
      return new URL(`https://${hostContext.hostname}`);
    } catch {
      // Malformed hostname header — fall through to the platform base rather
      // than emit a broken origin.
    }
  }
  return publicSiteMetadataBase();
}
