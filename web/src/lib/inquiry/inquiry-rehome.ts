/**
 * Phase B — re-home a cross-tenant inquiry onto its single managing agency.
 *
 * When every talent on an inquiry is managed by ONE tenant that differs from
 * the host the lead entered through (the exclusive-agency-via-hub case), the
 * inquiry should be FILED under that managing agency so it lands in their
 * Messages/Work inbox and under their RLS — both key off `inquiries.tenant_id`.
 * The originating channel is preserved separately on `source_workspace_id`
 * (Phase A), so re-homing never loses "where the lead came from".
 *
 * Conservative by design — re-homes ONLY when there is exactly one managing
 * tenant and it differs from the host. Mixed-agency lineups, talent-direct
 * (hub self-coordinated) inquiries, and same-tenant storefront inquiries all
 * stay on the host. Gated by the XTENANT_REHOME env flag (default off) so it
 * ships dark and is a pure no-op until switched on.
 */
import type { OwningParty } from "./owning-party-resolver";

export function resolveInquiryHome(
  owningParties: Map<string, OwningParty>,
  talentProfileIds: string[],
  hostTenantId: string,
): string {
  if (process.env.XTENANT_REHOME !== "1") return hostTenantId;

  const managingTenantIds = new Set<string>();
  for (const talentId of talentProfileIds) {
    const owner = owningParties.get(talentId);
    if (!owner) continue;
    // Talent-direct (hub self-coordination) has no managing agency — keep the
    // inquiry on the host so the talent + platform officer run it.
    if (owner.type === "talent") return hostTenantId;
    managingTenantIds.add(owner.id);
  }

  // Exactly one managing tenant, and it isn't the host → re-home to it.
  if (managingTenantIds.size === 1) {
    const [only] = [...managingTenantIds];
    if (only && only !== hostTenantId) return only;
  }
  return hostTenantId;
}
