/**
 * Offering → offer-line mapping. Pure + directive-free.
 *
 * `TalentOffering.priceType` IS the `inquiry_offer_line_items.pricing_unit`
 * enum (same contract as services-menu-offer.ts), so the unit mapping is the
 * identity. This module is the single choke-point that turns a client's
 * offering selection (+ quantity) into the shape an offer line expects —
 * `source_service_id` is stamped with the offering id so analytics and the
 * composer can trace provenance.
 *
 * MONEY RULE: `unit_price`/`total_price` here feed the offer SUBTOTAL only.
 * The client is charged the commission snapshot's gross (subtotal + surcharge
 * + fees) computed downstream by resolveBookingCommissions — never these raw
 * numbers directly.
 */

import type { TalentOffering } from "./offerings-types";
import type { OfferPricingUnit } from "./services-menu-offer";

/** Units where a client-picked quantity multiplies the price. */
const QUANTITY_UNITS: readonly OfferPricingUnit[] = ["hour", "day", "week", "half_day", "per_person", "per_contact"];

export type OfferingOfferLineSeed = {
  talent_profile_id: string;
  label: string;
  pricing_unit: OfferPricingUnit;
  units: number;
  unit_price: number; // major units (offer lines store major units)
  total_price: number; // unit_price × units
  source_service_id: string;
};

/** Offer-priceable = carries a concrete positive amount (custom/quote never pre-fill a price). */
export function offeringIsOfferPriceable(
  o: Pick<TalentOffering, "priceType" | "priceDisplay" | "amountCents">,
): boolean {
  return o.priceType !== "custom" && o.priceDisplay !== "quote" && o.amountCents != null && o.amountCents > 0;
}

/**
 * Build the offer-line seed for a selected offering. `quantity` applies only
 * to quantity-bearing units (hours, days, people, sessions); flat/package/event
 * lines are always units=1.
 */
export function offeringToOfferLineSeed(
  o: Pick<TalentOffering, "id" | "talentProfileId" | "title" | "priceType" | "amountCents">,
  quantity = 1,
): OfferingOfferLineSeed | null {
  if (o.amountCents == null || o.amountCents <= 0 || o.priceType === "custom") return null;
  const qty = QUANTITY_UNITS.includes(o.priceType)
    ? Math.max(1, Math.min(999, Math.round(quantity)))
    : 1;
  const unitPrice = o.amountCents / 100;
  return {
    talent_profile_id: o.talentProfileId,
    label: o.title,
    pricing_unit: o.priceType,
    units: qty,
    unit_price: unitPrice,
    total_price: Math.round(unitPrice * qty * 100) / 100,
    source_service_id: o.id,
  };
}
