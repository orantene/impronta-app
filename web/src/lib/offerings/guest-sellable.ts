/**
 * D-10 (PM consultant ruling, 2026-10-18): a guest sees, lists and can add ONLY
 * services that are published AND approved AND public. `status = published`
 * alone let an unapproved (`pending` / `rejected`) or hidden (`agency_only`,
 * `on_request`) service reach a logged-out visitor on the visit menu, the
 * Concierge dock and the class / event pickers. One definition, used by every
 * guest-facing service list and add path, so the rule cannot be re-derived
 * three slightly different ways.
 */

type OfferingGate = { status?: unknown; moderation_state?: unknown; visibility?: unknown };

export function isGuestSellableOffering(row: OfferingGate | null | undefined): boolean {
  return Boolean(row) && row!.status === "published" && row!.moderation_state === "approved" && row!.visibility === "public";
}

type EqChain = { eq(column: string, value: unknown): EqChain };

/** The same rule as a query filter, for lists. Tenant scoping stays the caller's own `.eq("tenant_id", ...)`. */
export function scopeToGuestSellableOfferings<Q>(query: Q): Q {
  return (query as unknown as EqChain)
    .eq("status", "published")
    .eq("moderation_state", "approved")
    .eq("visibility", "public") as unknown as Q;
}
