/**
 * TUL-1252. `/pay/<code>` and `/link/<code>` are served on the platform app
 * host as well as on tenant hosts, because the client account (which links to
 * them with a relative path) lives on the app host. The conversation (`/c`) and
 * receipt (`/r`) pages are tenant-owned, so a link to either from a pay page
 * served on the app host would be a branded 404. Hide them there.
 */
export type PayAccess = "render" | "expired" | "not_found";

/**
 * What `/pay/<code>` does for a loaded link on this host (A2). The code is the
 * credential on the app host and on hub / talent hosts, but a branded AGENCY
 * host serves only its own tenant's links: another tenant's valid code must not
 * render there, nor its expired page (which would name that tenant's order).
 */
export function decidePayAccess(
  loaded: { ok: true; tenantId: string } | { ok: false; reason: string; tenantId?: string },
  host: { kind: string; tenantId?: string | null },
): PayAccess {
  const linkTenant = "tenantId" in loaded ? loaded.tenantId : undefined;
  const foreign = host.kind === "agency" && Boolean(host.tenantId) && Boolean(linkTenant) && linkTenant !== host.tenantId;
  if (loaded.ok) return foreign ? "not_found" : "render";
  if (loaded.reason === "expired") return foreign ? "not_found" : "expired";
  return "not_found";
}

export function hostServesTenantPayLinks(kind: string): boolean {
  return kind === "agency" || kind === "hub" || kind === "talent_site";
}
