/**
 * Talent custom-domain (`kind: "talent_site"`) host path routing.
 *
 * A talent's custom domain serves a SMALL surface: the site home (`/`) and its
 * inner pages (`/<pageSlug>`), plus the shared static / API / compliance paths
 * that every host kind allows. Everything else 404s. This keeps a talent vanity
 * domain from exposing the workspace, the directory, auth, or any other tenant
 * surface.
 *
 * The matched request is internally rewritten to the host route at
 * `app/_talent-site/[[...pageSlug]]/page.tsx`, which reads the resolved
 * talent_profile_id from the host header and renders via `renderTalentMaxSite`.
 */

export const TALENT_SITE_HOST_ROUTE_PREFIX = "/_talent-site" as const;

/**
 * Shared, host-agnostic prefixes that must remain reachable on ANY host
 * (cron / webhooks / health probes / unsubscribe). Mirrors the
 * `SHARED_API_PREFIXES` + `COMPLIANCE_PREFIXES` allow-list intent so a talent
 * domain never breaks platform plumbing. Static files are matched separately.
 */
const TALENT_SITE_PASSTHROUGH_PREFIXES = [
  "/api/",
  "/_next/",
  "/unsubscribe",
] as const;

const TALENT_SITE_STATIC_PATHS = ["/sitemap.xml", "/robots.txt", "/favicon.ico"] as const;

/**
 * A single page-slug segment: lowercase alphanumerics + hyphens, the same shape
 * talent page slugs use. Rejects anything with a second segment, a dot, an
 * uppercase letter, or reserved characters — so `/about` matches but
 * `/about/extra`, `/api/x`, and `/foo.bar` do not.
 */
const TALENT_PAGE_SLUG = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Single-segment paths that must NEVER be treated as a talent page slug, even
 * though they match the slug shape. These are platform surface words; on a
 * talent vanity domain they 404 at the allow-list rather than being routed into
 * the talent site render. Keeps a talent domain from exposing (or appearing to
 * expose) the workspace, auth, or directory at its apex.
 */
const RESERVED_TALENT_SITE_SLUGS = new Set([
  "admin",
  "client",
  "talent",
  "login",
  "register",
  "auth",
  "join",
  "onboarding",
  "invite",
  "account",
  "platform",
  "directory",
  "api",
  "share",
  "c",
  "p",
  "posts",
  "models",
  "t",
]);

export type TalentSiteHostPath =
  | { kind: "passthrough" }
  | { kind: "render"; pageSlug: string | null };

/**
 * Decide how a path resolves on a talent_site host. `pathname` must already be
 * locale-stripped (the proxy strips the non-default locale prefix before
 * calling). Returns null for any path that is NOT allowed → the caller 404s.
 */
export function isTalentSiteHostPathAllowed(
  pathname: string,
): TalentSiteHostPath | null {
  // Shared plumbing + static assets pass straight through untouched.
  if (
    TALENT_SITE_STATIC_PATHS.includes(pathname as (typeof TALENT_SITE_STATIC_PATHS)[number]) ||
    TALENT_SITE_PASSTHROUGH_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))
  ) {
    return { kind: "passthrough" };
  }

  // Site home.
  if (pathname === "/") {
    return { kind: "render", pageSlug: null };
  }

  // Single-segment page slug → an inner site page (unless it's a reserved
  // platform word, which 404s here rather than routing into the talent site).
  const segments = pathname.split("/").filter(Boolean);
  if (
    segments.length === 1 &&
    TALENT_PAGE_SLUG.test(segments[0]) &&
    !RESERVED_TALENT_SITE_SLUGS.has(segments[0])
  ) {
    return { kind: "render", pageSlug: segments[0] };
  }

  return null;
}

/**
 * Internal rewrite target for a talent_site render path. Root → the bare host
 * route; a page slug → the host route with the slug appended (the optional
 * catch-all `[[...pageSlug]]` captures it).
 */
export function talentSiteHostRewritePath(pageSlug: string | null): string {
  return pageSlug
    ? `${TALENT_SITE_HOST_ROUTE_PREFIX}/${pageSlug}`
    : TALENT_SITE_HOST_ROUTE_PREFIX;
}
