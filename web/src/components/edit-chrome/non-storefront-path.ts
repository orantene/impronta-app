/**
 * Shared "is this a public storefront path?" test for the two chrome mounts.
 *
 * `EditChromeMount` (the editor) and `AdminQuickBarMount` (the admin strip)
 * answer different questions about which SURFACE they own, but they must agree
 * exactly on which paths are public at all. Dashboard, auth and onboarding
 * routes render their own chrome; either mount appearing on top of that is a
 * bug. Keeping the list in one module means a new dashboard prefix can never be
 * added to one gate and forgotten in the other.
 *
 * Extracted verbatim from `edit-chrome-mount.tsx` (PR #1001 and earlier); the
 * behaviour is unchanged, only its address.
 *
 * No React, no CSS, no server imports — so the node:test runner can load it.
 */

/**
 * Path prefixes that are never storefronts.
 * Checked against the raw request pathname (before any rewrites).
 *
 * Important: tenant agency hosts (impronta.tulala.digital) ALLOW dashboard
 * paths so members can run the workspace from their subdomain
 * (`surface-allow-list.ts` AGENCY branch). That means /admin, /talent,
 * /client all resolve on the agency host — which would also match the
 * `agency` kind check and try to mount chrome on top of dashboard chrome.
 * Every dashboard prefix MUST appear here.
 */
export const NON_STOREFRONT_PREFIXES = [
  "/admin",
  "/talent",   // talent dashboard (NOT /t/<slug> public profile)
  "/client",   // client dashboard
  "/login",
  "/register",
  "/auth",
  "/onboarding",
  "/account",  // account settings
  "/t/",       // talent public profiles
  "/share/",   // share links
  "/invite/",  // invite flows
  "/api/",     // API routes (safety belt)
  "/dev/",     // internal dev routes
  "/prototypes/", // dev/staging prototype routes
  "/update-password",
  "/forgot-password",
  "/waitlist",
] as const;

/**
 * Strip a leading tenant slug / public path prefix from the raw pathname.
 *
 * On tenant hosts the URL can legitimately carry the tenant slug as the first
 * segment (e.g. `improntamodels.com/impronta/admin/roster/[id]`). The
 * `(workspace)/[tenantSlug]` route resolves the same way for both path-based
 * access (`tulala.digital/impronta/...`) and custom-domain access, so admins
 * reach the dashboard with the slug in the path on BOTH host kinds. Without
 * this normalisation the prefix check silently misses `/impronta/admin/...`
 * and chrome mounts over the dashboard.
 */
export function normalizeStorefrontPath(
  rawPathname: string,
  publicPathPrefix: string,
  tenantSlug: string,
): string {
  let normalized = rawPathname;
  if (publicPathPrefix && normalized.startsWith(publicPathPrefix)) {
    normalized = normalized.slice(publicPathPrefix.length) || "/";
  } else if (tenantSlug) {
    const slugPrefix = `/${tenantSlug}`;
    if (normalized === slugPrefix || normalized.startsWith(`${slugPrefix}/`)) {
      normalized = normalized.slice(slugPrefix.length) || "/";
    }
  }
  return normalized;
}

/** True when the (already normalised) path belongs to a non-storefront surface. */
export function isNonStorefrontPath(normalizedPath: string): boolean {
  return NON_STOREFRONT_PREFIXES.some(
    (prefix) =>
      normalizedPath === prefix.replace(/\/$/, "") ||
      normalizedPath.startsWith(prefix),
  );
}
