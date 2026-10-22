/**
 * plan-change-breakdown.ts (TUL-831 / TUL-833) · pure maths for the confirm
 * step's line items. No IO, no "server-only": the numbers come from a Stripe
 * preview invoice that the caller already fetched.
 *
 * Credit and charge are the magnitudes of the preview invoice's negative and
 * positive lines (Stripe books unused time on the old price as a negative line
 * and the remaining time on the new price as a positive one). The discount is
 * Stripe's own `total_discount_amounts`, so a promo shows exactly as it will be
 * charged. `total` is `amount_due`: the number that leaves the card today.
 */
import { computePromoPreview } from "./promo-preview";
import type { PlanChangeBreakdown } from "./plan-change-policy";
import type { PricingDiscountRow } from "@/lib/pricing/pricing-types";

export type PreviewInvoiceLike = {
  amount_due: number;
  currency: string;
  lines?: { data?: ReadonlyArray<{ amount: number }> } | null;
  total_discount_amounts?: ReadonlyArray<{ amount: number }> | null;
};

/**
 * The amount of the NEXT renewal on the new price. A "once" code is spent on
 * today's invoice, so the renewal is the list price; a repeating / forever /
 * free-months code still applies. A fixed amount code is only subtracted when
 * the price is in the catalog currency it was written in (USD), never guessed
 * across currencies.
 */
export function renewalAmount(
  unitAmount: number | null,
  currency: string,
  discount: PricingDiscountRow | null,
): number | null {
  if (unitAmount === null || !Number.isInteger(unitAmount) || unitAmount < 0) return null;
  if (!discount) return unitAmount;
  const preview = computePromoPreview(discount, unitAmount);
  if (preview.duration === "once") return unitAmount;
  if (preview.kind === "fixed" && currency.toLowerCase() !== (discount.currency ?? "usd").toLowerCase()) {
    return unitAmount;
  }
  return preview.discountedCents;
}

export function buildBreakdown(invoice: PreviewInvoiceLike, renewal: number | null): PlanChangeBreakdown {
  let credit = 0;
  let charge = 0;
  for (const line of invoice.lines?.data ?? []) {
    if (line.amount < 0) credit += -line.amount;
    else charge += line.amount;
  }
  const discount = (invoice.total_discount_amounts ?? []).reduce((sum, d) => sum + d.amount, 0);
  return { credit, charge, discount, total: invoice.amount_due, renewal };
}
