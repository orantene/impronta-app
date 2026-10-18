/**
 * TUL-1252. `/pay/<code>` and `/link/<code>` are served on the platform app
 * host as well as on tenant hosts, because the client account (which links to
 * them with a relative path) lives on the app host. The conversation (`/c`) and
 * receipt (`/r`) pages are tenant-owned, so a link to either from a pay page
 * served on the app host would be a branded 404. Hide them there.
 */
export function hostServesTenantPayLinks(kind: string): boolean {
  return kind === "agency" || kind === "hub" || kind === "talent_site";
}
