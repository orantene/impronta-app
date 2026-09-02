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

/**
 * Checkout-routing predicate — is this inquiry a CROSS-CHANNEL RE-HOME?
 *
 * TRUE only when the inquiry's originating channel (`source_workspace_id`, the
 * host the client entered through — Phase A) differs from where the inquiry is
 * now filed (`inquiries.tenant_id`). That is exactly the hub / Discover case
 * where the inquiry was routed onto a managing agency that is NOT the channel it
 * came in through.
 *
 * NO LONGER CONSUMED BY CHECKOUT (2026-09-01). This was startInquiryCheckout's
 * escape hatch: a re-homed inquiry had to be forced onto the PLATFORM account
 * because a Direct Charge on the re-home tenant would strand the
 * platform-funded payout fan-out. The Direct Charge lane has since been removed
 * outright — EVERY booking charge now settles on the platform — so there is no
 * routing decision left for this predicate to make. It is kept because it
 * states a true and separately useful fact about an inquiry (its channel is not
 * its home) and is covered by tests; it has no production caller today.
 *
 * Strict no-op for NATIVE inquiries: a client on the agency's own storefront
 * contacting the agency's own talent has source_workspace_id == tenant_id →
 * FALSE. Also FALSE when source_workspace_id is null (pre-attribution legacy
 * rows), so it only ever reports true when channel != home is positively proven.
 */
export function isCrossChannelRehomedInquiry(
  tenantId: string,
  sourceWorkspaceId: string | null | undefined,
): boolean {
  return !!sourceWorkspaceId && sourceWorkspaceId !== tenantId;
}
