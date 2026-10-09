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
