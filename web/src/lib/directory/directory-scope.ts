/**
 * TUL-1233 / TUL-1789: the ONE rule for which tenant a directory read is scoped to, shared by the list
 * (`/api/directory`: agency -> its tenant, hub -> null) and the server-rendered section (first page, facet counts,
 * scope seed). A hub host carries the hub's own tenant id in the scope header, but the hub directory is cross-tenant:
 * scoping the facets to that tenant's roster while the list paged across everyone is what showed 92 results next to
 * "México (1)". Pure so a test pins it.
 */
export function directoryTenantIdForHost(hostKind: string, headerTenantId: string | null): string | null {
  if (hostKind === "hub") return null;
  return headerTenantId;
}
