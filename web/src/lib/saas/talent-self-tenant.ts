/**
 * Pure decision for which tenant a talent self-action runs under.
 *
 * The host/session tenant scope (`getTenantScope`) is derived from the
 * caller's STAFF memberships (or the super_admin synthetic "all tenants"
 * list), never from the talent roster. It is therefore only trustworthy for
 * talent self-edits when the talent is actually rostered (active) on that
 * tenant; otherwise rows would be written tagged with a tenant the talent
 * does not belong to (cross-tenant pollution, readable by that tenant's
 * staff through is_staff_of_tenant RLS).
 *
 * `rosterTenantIds` must be the talent's ACTIVE roster tenants, oldest first.
 * On a roster query error callers pass `null`: we fail closed to null, never
 * to the host tenant.
 */
export function pickTalentTenant(input: {
  scopeTenantId: string | null;
  rosterTenantIds: readonly string[] | null;
}): string | null {
  const { scopeTenantId, rosterTenantIds } = input;
  if (!rosterTenantIds || rosterTenantIds.length === 0) return null;
  if (scopeTenantId && rosterTenantIds.includes(scopeTenantId)) return scopeTenantId;
  return rosterTenantIds[0] ?? null;
}
