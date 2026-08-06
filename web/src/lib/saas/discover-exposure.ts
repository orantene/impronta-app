/**
 * Tenant-level Discover / hub exposure — shared types + pure rules.
 *
 * Product rule: every talent on a Tulala tenant appears on Tulala Discover by
 * DEFAULT. A workspace can veto that for its own talents, and — if it stays in
 * — can narrow WHICH hubs may list them.
 *
 * Two storage fields on `agencies` (migration 20261111090000):
 *
 *   discover_exposure_enabled  TRUE  = default; list on Tulala Discover + hubs
 *                              FALSE = keep this workspace's talents off Tulala
 *                                      Discover and off every hub
 *
 *   hub_exposure_tenant_ids    NULL  = any hub (default)
 *                              []    = no hub
 *                              [ids] = only these hub tenants
 *
 * The Discover grid enforces `discover_exposure_enabled` inside the
 * `talent_discover_index` matview, so every consumer of that index (directory,
 * Discover grid, section-builder cards, map pins) inherits it. This module
 * carries the hub allow-list rule, which is evaluated per hub surface.
 *
 * Both fields are an agency-level VETO layered on top of the talent's own
 * `talent_profiles.is_discoverable`. Neither can force a talent to be listed
 * who has opted out themselves.
 */

/** Exposure config for one workspace. */
export type TenantDiscoverExposure = {
  /** FALSE keeps this workspace's talents off Tulala Discover and every hub. */
  discoverExposureEnabled: boolean;
  /** NULL = all hubs allowed. Otherwise an allow-list of hub tenant ids. */
  hubExposureTenantIds: string[] | null;
};

/** Platform default — what every workspace gets until an admin changes it. */
export const DEFAULT_TENANT_DISCOVER_EXPOSURE: TenantDiscoverExposure = {
  discoverExposureEnabled: true,
  hubExposureTenantIds: null,
};

/** Row shape as stored on `agencies`. */
export type TenantDiscoverExposureRow = {
  discover_exposure_enabled?: boolean | null;
  hub_exposure_tenant_ids?: string[] | null;
};

/** Map a DB row to the config, falling back to the permissive default. */
export function mapTenantDiscoverExposure(
  row: TenantDiscoverExposureRow | null | undefined,
): TenantDiscoverExposure {
  if (!row) return DEFAULT_TENANT_DISCOVER_EXPOSURE;
  return {
    discoverExposureEnabled: row.discover_exposure_enabled ?? true,
    hubExposureTenantIds: Array.isArray(row.hub_exposure_tenant_ids)
      ? row.hub_exposure_tenant_ids
      : null,
  };
}

/**
 * May `hubTenantId` list a talent whose primary workspace has this config?
 *
 * Independent talent (no primary workspace) pass `null` and are always allowed
 * — nobody speaks for them but themselves.
 */
export function hubMayListTalent(
  exposure: TenantDiscoverExposure | null,
  hubTenantId: string,
): boolean {
  if (!exposure) return true;
  if (!exposure.discoverExposureEnabled) return false;
  const allowed = exposure.hubExposureTenantIds;
  if (allowed === null) return true;
  return allowed.includes(hubTenantId);
}
