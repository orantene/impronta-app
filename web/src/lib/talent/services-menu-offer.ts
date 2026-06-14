/**
 * Services menu → offer line mapping (S2). Pure + directive-free.
 *
 * Because the `inquiry_offer_line_items.pricing_unit` Postgres enum was extended
 * (migration: half_day / per_person / per_contact / flat_package / custom), a
 * service's `pricingType` IS a valid offer `pricing_unit` — so the mapping is
 * the identity. This module exists as the single, named choke-point so future
 * callers (offer composer pre-fill in Phase D) never hardcode a unit and the
 * "invalid_pricing_unit" guard in updateOfferDraft can never fire from a
 * menu-driven line.
 */

import type { ServiceMenuItem, ServicePricingType } from "./services-menu-types";

/** The offer line-item unit enum (must match `pricing_unit` in the DB). */
export type OfferPricingUnit = ServicePricingType;

/** Identity mapping (post-enum-extension). Named for intent + future-proofing. */
export function servicePricingTypeToOfferUnit(t: ServicePricingType): OfferPricingUnit {
  return t;
}

/**
 * A service is offer-priceable (can pre-fill a priced line) only when it carries
 * a concrete amount. A `custom` service is a quote-on-request trigger, not a
 * priced line — the composer inquires instead of auto-pricing.
 */
export function isServiceOfferPriceable(item: Pick<ServiceMenuItem, "pricingType" | "amountCents">): boolean {
  return item.pricingType !== "custom" && item.amountCents != null && item.amountCents > 0;
}
