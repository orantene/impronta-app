/** P0: on a per-talent page the guest roster is that talent only; with no talent it is unchanged. */
export function scopeRosterToTalent<T extends { id: string }>(roster: readonly T[], talentProfileId: string | null | undefined): T[] {
  return talentProfileId ? roster.filter((r) => r.id === talentProfileId) : [...roster];
}

/**
 * Which talent (if any) a guest surface is narrowed to. Only a HUB tenant owns no
 * roster of its own (it lists the cross-tenant Discover index), so only there does a
 * talent's page narrow to that one talent. An agency page keeps the agency's own
 * roster (that tenant's talent + services); a single talent's own site is already
 * one talent. Never other tenants either way.
 */
export function narrowTalentForTenant(tenantKind: string | null | undefined, talentProfileId: string | null | undefined): string | null {
  return tenantKind === "hub" && talentProfileId ? talentProfileId : null;
}
