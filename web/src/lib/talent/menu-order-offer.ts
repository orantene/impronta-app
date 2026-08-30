/**
 * Build offer-line seeds for a Menu order (workspace-owned offerings).
 *
 * Do NOT reuse `offeringToOfferLineSeed`. That helper hard-codes a talent id,
 * omits talent_cost, and its QUANTITY_UNITS excludes `event` and `flat_package`
 * — the two units a pizza (or set menu) is actually priced in — forcing
 * units=1. "2 pepperoni" would silently bill as 1. It has no production
 * caller; keep it that way.
 *
 * MONEY RULE: unit_price/total_price feed the offer SUBTOTAL only. The client
 * is charged the commission snapshot gross downstream.
 */

import type { OfferPricingUnit } from "./services-menu-offer";

export type MenuOrderItemInput = {
  offeringId: string;
  title: string;
  priceType: OfferPricingUnit;
  /** Amount in cents from the published offering. */
  amountCents: number;
  quantity: number;
};

export type MenuOfferLineSeed = {
  talent_profile_id: null;
  owner_tenant_id: string;
  label: string;
  pricing_unit: OfferPricingUnit;
  units: number;
  unit_price: number;
  total_price: number;
  talent_cost: 0;
  source_service_id: string;
};

const MAX_QTY = 99;

/**
 * Quantity applies to EVERY pricing unit for menu orders — including `event`
 * and `flat_package`. Clamp to [1, 99].
 */
export function menuOrderToOfferLineSeeds(
  items: readonly MenuOrderItemInput[],
  tenantId: string,
): MenuOfferLineSeed[] {
  if (!tenantId) return [];
  const seeds: MenuOfferLineSeed[] = [];
  for (const item of items) {
    if (!item.offeringId || item.amountCents <= 0 || item.priceType === "custom") continue;
    const qty = Math.max(1, Math.min(MAX_QTY, Math.round(item.quantity)));
    const unitPrice = item.amountCents / 100;
    seeds.push({
      talent_profile_id: null,
      owner_tenant_id: tenantId,
      label: item.title,
      pricing_unit: item.priceType,
      units: qty,
      unit_price: unitPrice,
      total_price: Math.round(unitPrice * qty * 100) / 100,
      talent_cost: 0,
      source_service_id: item.offeringId,
    });
  }
  return seeds;
}
