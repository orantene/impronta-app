/**
 * D-10 (PM consultant ruling, 2026-10-18): a guest sees, lists and can add ONLY
 * services that are published AND approved AND public.
 *
 * Since D1 (TUL-1268) the rule itself lives in `./sellable` (`sellability`).
 * These are thin, stable names over it so older call sites keep one definition.
 */

import { isSellable, scopeToSellableOfferings, type SellableRow } from "./sellable";

export function isGuestSellableOffering(row: SellableRow | null | undefined): boolean {
  return isSellable(row, "guest");
}

/** The same rule as a query filter, for lists. Tenant scoping stays the caller's own `.eq("tenant_id", ...)`. */
export function scopeToGuestSellableOfferings<Q>(query: Q): Q {
  return scopeToSellableOfferings(query, "guest");
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
 * `staff` is the point of sale booking a walk-in at the desk. `reservation` is a
 * table booking against the venue's configured reservation offering.
 */
export type PurchaseChannel = "guest" | "staff" | "reservation";

export function isSellableOnChannel(row: SellableRow | null | undefined, channel: PurchaseChannel | undefined): boolean {
  if (channel === "staff") return isSellable(row, "pos_desk");
  if (channel === "reservation") return isSellable(row, "reservation");
  return isSellable(row, "guest");
}
