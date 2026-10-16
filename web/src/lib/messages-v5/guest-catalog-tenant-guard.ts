/**
 * TUL-1063 / TUL-1081: the guest dock's catalog tenant comes from the client
 * (`tenantSlug`), so it must agree with the tenant the request is served for.
 * A page on agency A asking for agency B's slug gets nothing.
 *
 * - Agency / hub host: the slug must resolve to the host's own tenant.
 * - Host with no tenant (talent custom site, app, local dev): only the platform
 *   hub's catalog, which is where hub talents live. Never an agency's.
 */
export type GuestCatalogHost = { kind: string; tenantId: string | null };

export function guestCatalogTenantAllowed(
  host: GuestCatalogHost,
  requestedTenantId: string,
  hubTenantId: string | null,
): boolean {
  if (host.tenantId) return host.tenantId === requestedTenantId;
  return hubTenantId !== null && hubTenantId === requestedTenantId;
}
