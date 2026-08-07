/**
 * Browser-facing admin base for the current host.
 *
 * Two questions decide the answer, and the original version only asked the
 * first one:
 *
 * 1. **Does this host name the tenant already?** A branded host
 *    (improntamodels.com) or a tenant subdomain serves admin at `/admin`.
 *    Repeating the slug there produces the doubled, non-canonical
 *    `improntamodels.com/impronta/admin` that #912 removed. Path-addressed
 *    hosts genuinely need `/{slug}/admin`.
 *
 * 2. **Does this host ROUTE `/{slug}/admin` at all?** This is the part that was
 *    missing. The free tier's default storefront is `tulala.digital/w/<slug>`,
 *    served on the MARKETING host, and `surface-allow-list.ts` deliberately
 *    keeps every workspace path off that host kind: `isWorkspaceSlugPath` is
 *    allowed on agency / app / hub and NOT on marketing. So a same-origin
 *    `/{slug}/admin/roster` on a `/w/<slug>` storefront 404s before routing
 *    even runs, which is why clicking Roster in the quick bar did nothing.
 *    The workspace lives on the app origin; from a path-addressed storefront
 *    the link has to be absolute.
 *
 * The app origin comes from configuration (`NEXT_PUBLIC_APP_URL`, falling back
 * to `NEXT_PUBLIC_SITE_URL`), never a domain literal, so it is right in dev,
 * preview and production. Two guards keep it from making things worse:
 *
 *   - same host as the page already → stay relative (no pointless absolute URL,
 *     and the app host keeps working exactly as before)
 *   - a LOCAL page (localhost / *.lvh.me / *.local) with a NON-local configured
 *     app origin → stay relative. A dev whose `.env.local` still points at the
 *     production app host must never be thrown out of their dev server; they
 *     get the previous behaviour instead.
 *
 * Mirrors the server-side derivation in `[tenantSlug]/admin/layout.tsx`: if the
 * CURRENT path carries the slug, the host is path-addressed; otherwise branded.
 * Editor URLs are `/w/{slug}` or `/{slug}` when path-addressed, and a bare `/`
 * or `/{page}` when branded.
 *
 * Kept in its own module (no React, no CSS, no `@/` imports) so it stays
 * importable by the node:test runner.
 */

/** True when `pathname` carries the tenant slug, i.e. the host is path-addressed. */
export function pathCarriesWorkspaceSlug(
  slug: string,
  pathname: string,
): boolean {
  return (
    pathname === `/${slug}` ||
    pathname.startsWith(`/${slug}/`) ||
    pathname === `/w/${slug}` ||
    pathname.startsWith(`/w/${slug}/`)
  );
}

/**
 * Configured origin of the workspace app, from env only.
 *
 * `NEXT_PUBLIC_*` values are inlined at build time, so this is readable from a
 * client component. Mirrors `getAppUrl()` in `lib/auth-flow` without importing
 * it, because this module must stay resolvable by the bare node:test runner.
 */
export function configuredWorkspaceAppOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  return raw.trim().replace(/\/+$/, "");
}

function hostnameOf(origin: string): string | null {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function originOf(origin: string): string | null {
  try {
    return new URL(origin).origin.toLowerCase();
  } catch {
    return null;
  }
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "lvh.me" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".lvh.me") ||
    hostname.endsWith(".local")
  );
}

/**
 * Origin to prefix onto `/{slug}/admin`, or `""` to stay same-origin.
 *
 * See the module header for why each guard exists.
 */
export function workspaceAdminAppOrigin(
  currentOrigin: string,
  configuredAppOrigin: string,
): string {
  const configured = configuredAppOrigin.trim().replace(/\/+$/, "");
  if (configured === "") return "";

  const configuredHost = hostnameOf(configured);
  if (!configuredHost) return "";

  const currentHost = hostnameOf(currentOrigin);
  // Unparseable current origin: prefer the configured app host over guessing.
  if (!currentHost) return configured;

  // Already on the app origin: relative wins. Compared as a full origin rather
  // than a bare hostname so a local rig that puts the marketing and app hosts
  // on the same name and different ports still crosses over correctly.
  if (originOf(currentOrigin) === originOf(configured)) return "";

  // Never bounce a local dev session onto a remote app host.
  if (isLocalHostname(currentHost) && !isLocalHostname(configuredHost)) {
    return "";
  }

  return configured;
}

export function resolveWorkspaceAdminBase(
  slug: string,
  pathname: string,
  appOrigin = "",
): string {
  if (!pathCarriesWorkspaceSlug(slug, pathname)) return "/admin";
  return `${appOrigin.replace(/\/+$/, "")}/${slug}/admin`;
}

/**
 * The form every browser caller wants: resolve the admin base for the page the
 * operator is looking at, absolute when this host cannot route it.
 */
export function resolveWorkspaceAdminBaseForLocation(
  slug: string,
  location: { origin: string; pathname: string },
): string {
  return resolveWorkspaceAdminBase(
    slug,
    location.pathname,
    workspaceAdminAppOrigin(location.origin, configuredWorkspaceAppOrigin()),
  );
}
