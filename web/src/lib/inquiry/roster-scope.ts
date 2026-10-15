/** P0: on a per-talent page the guest roster is that talent only; with no talent it is unchanged. */
export function scopeRosterToTalent<T extends { id: string }>(roster: readonly T[], talentProfileId: string | null | undefined): T[] {
  return talentProfileId ? roster.filter((r) => r.id === talentProfileId) : [...roster];
}

/**
 * The tenant a talent's offerings are read under for the Concierge dock/chips
 * (P0 TUL-1070). Always the CURRENT tenant, so another tenant's catalog for the
 * same talent never shows. The one exception is a HUB page, which owns no
 * catalog of its own and shows the talent's own services (same rule as the
 * storefront payload: `agency => tenantId, hub => null`).
 */
export function offeringsTenantScope(tenantKind: string | null | undefined, tenantId: string | null | undefined): string | null {
  if (!tenantId) return null;
  return tenantKind === "hub" ? null : tenantId;
}
