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

/**
 * TUL-1347: the STAFF quote list (Messages items picker). Staff quote
 * `on_request` and `agency_only` services, so visibility is not a gate here;
 * published AND approved still is. Used ONLY by `messagingLoadItemsCatalog`;
 * the guest dock keeps `scopeToGuestSellableOfferings`.
 */
export function scopeToStaffQuotableOfferings<Q>(query: Q): Q {
  return (query as unknown as EqChain).eq("status", "published").eq("moderation_state", "approved") as unknown as Q;
}

export type CatalogScope = "guest" | "staff";

/** One switch for the readers: guest (default, strict) or staff quote list. */
export function scopeOfferingsFor<Q>(query: Q, scope: CatalogScope | undefined): Q {
  return scope === "staff" ? scopeToStaffQuotableOfferings(query) : scopeToGuestSellableOfferings(query);
}

/**
 * Which door a purchase came through. `guest` is every public and storefront
 * surface and is the DEFAULT: a caller that forgets to say gets the strict rule.
 * `staff` is the point of sale booking a walk-in at the desk, where a person
 * with workspace access is the confirmation and an `agency_only` service is
 * exactly what they sell.
 */
export type PurchaseChannel = "guest" | "staff";

/**
 * Checkout's form of D-10 / D-10a. A guest charge needs published + approved +
 * public. `on_request` visibility is not `public`, so an on-request service can
 * never take an instant charge here; it only has request / quote paths.
 */
export function isSellableOnChannel(
  row: OfferingGate | null | undefined,
  channel: PurchaseChannel | undefined,
): boolean {
  if (channel === "staff") return Boolean(row) && row!.status === "published";
  return isGuestSellableOffering(row);
}
