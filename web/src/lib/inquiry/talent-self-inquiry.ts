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

/**
 * The offer verbs (create, edit, send) for a talent, on her OWN talent_self
 * inquiry only: she started it (`started_by: "talent"`), she owns it, it is on
 * the platform hub and her profile is the whole lineup. An inquiry she is merely
 * named on (agency work, a hub lineup, another owner) stays with its coordinator.
 * Pure.
 */
export function talentOwnOfferAllowed(input: {
  actorUserId: string | null;
  ownerUserId: string | null | undefined;
  startedBy: unknown;
  actorTalentProfileId: string | null;
  talentProfileIds: readonly string[];
  tenantId: string | null | undefined;
  hubTenantId: string | null | undefined;
}): boolean {
  if (!input.actorUserId || input.ownerUserId !== input.actorUserId) return false;
  if (input.startedBy !== "talent") return false;
  return talentSelfInquiryAllowed(input);
}

/**
 * The offer verbs for the OWNER of a workspace who is herself the whole lineup
 * (a solo or 'both' owner selling her own service). The invite rows a fresh
 * inquiry starts with ('invited') must not lock her out of her own business: she
 * is the owner, so nobody else could accept for her. Lineups with another talent
 * stay with their coordinator. Pure; the owner proof is read by the caller.
 */
export function ownerTalentOwnLineupOfferAllowed(input: {
  actorTalentProfileId: string | null;
  talentProfileIds: readonly string[];
  actorIsActiveWorkspaceOwner: boolean;
}): boolean {
  const own = input.actorTalentProfileId;
  if (!own || !input.actorIsActiveWorkspaceOwner) return false;
  return input.talentProfileIds.length === 1 && input.talentProfileIds[0] === own;
}
