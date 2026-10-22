/**
 * Catalog tenant for grounding — matches profile-view / talent-site public load.
 * Agency host → surface tenant; talent-site / hub / platform → null (all public).
 * Never use the inquiry's assigned tenant here.
 */
export function catalogTenantForPublicHost(
  hostKind: string,
  hostTenantId: string | null,
): string | null {
  return hostKind === "agency" ? hostTenantId : null;
}

/**
 * TUL-662: the assistant's catalog must equal what the talent's public site
 * lists. The talent site reads the talent's own rows with NO tenant filter
 * (render-max-site passes null), while an agency-host scope filters on the
 * host's tenant. When the host tenant is not the tenant the talent's rows are
 * filed under (a concierge talent served from another workspace's host, a
 * path or subdomain mapped to a sibling tenant), the scoped read is empty and
 * the assistant told the guest it had no information about services the page
 * itself listed. An empty scoped read therefore retries on the talent's own
 * direct channel (owner_kind 'talent', guest-visible), which is the same set
 * the hub profile and the talent site already print publicly, so nothing
 * private is widened.
 */
export async function loadCatalogWithTalentFallback<T>(
  load: (tenantId: string | null) => Promise<readonly T[]>,
  catalogTenantId: string | null,
): Promise<{ rows: T[]; usedFallback: boolean }> {
  const scoped = await load(catalogTenantId);
  if (scoped.length > 0 || catalogTenantId === null) {
    return { rows: [...scoped], usedFallback: false };
  }
  const direct = await load(null);
  return { rows: [...direct], usedFallback: direct.length > 0 };
}
