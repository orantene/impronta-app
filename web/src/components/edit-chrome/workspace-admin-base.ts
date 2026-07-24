/**
 * Browser-facing admin base for the current host.
 *
 * A host that already identifies the tenant (custom domain like
 * improntamodels.com, or a tenant subdomain) serves admin at `/admin`.
 * Repeating the slug there produces the doubled, non-canonical
 * `improntamodels.com/impronta/admin` that #912 removed. Path-addressed hosts
 * (the shared app host, local dev) genuinely need `/{slug}/admin`.
 *
 * Mirrors the server-side derivation in `[tenantSlug]/admin/layout.tsx`: if the
 * CURRENT path carries the slug, the host is path-addressed; otherwise branded.
 * Editor URLs are `/w/{slug}` or `/{slug}` when path-addressed, and a bare `/`
 * or `/{page}` when branded.
 *
 * Kept in its own module (no React, no CSS) so it stays importable by the
 * node:test runner.
 */
export function resolveWorkspaceAdminBase(
  slug: string,
  pathname: string,
): string {
  const carriesSlug =
    pathname === `/${slug}` ||
    pathname.startsWith(`/${slug}/`) ||
    pathname === `/w/${slug}` ||
    pathname.startsWith(`/w/${slug}/`);
  return carriesSlug ? `/${slug}/admin` : "/admin";
}
