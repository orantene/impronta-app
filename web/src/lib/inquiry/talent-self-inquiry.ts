/**
 * Inquiry funnel: a talent may open a conversation for HERSELF only. The
 * lineup must be exactly her own profile and the tenant must be the
 * platform hub (a solo talent sells there). Anything else (another talent,
 * a lineup, an agency tenant, no hub) stays refused, so agency-owned work
 * is created by agency staff as before. Pure.
 */
export function talentSelfInquiryAllowed(input: {
  actorTalentProfileId: string | null;
  talentProfileIds: readonly string[];
  tenantId: string | null | undefined;
  hubTenantId: string | null | undefined;
}): boolean {
  const own = input.actorTalentProfileId;
  if (!own) return false;
  if (input.talentProfileIds.length !== 1 || input.talentProfileIds[0] !== own) return false;
  return Boolean(input.hubTenantId && input.tenantId && input.tenantId === input.hubTenantId);
}
