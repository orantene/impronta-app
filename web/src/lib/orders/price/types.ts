/**
 * Types for the ONE price module (TUL-1298, D2-A). Pure: no server-only imports, so the booking
 * sheet and the purchase rail can use the same shapes the server quotes with.
 *
 * Every amount is integer minor units. The module never divides by 100: the currency exponent
 * belongs to `minorUnitDivisor` in `money-format.ts`.
 */
import type { PricedLine } from "@/lib/orders/purchase-pricing";

export type SelectionLine = {
  offeringId: string;
  units: number;
  variantId?: string | null;
  addonIds?: readonly string[];
};

/** How the money is split once the promo is known. */
export type CollectMode = "full" | "deposit" | "none";

export type DueNowInput = {
  /** Fee-free list subtotal (sum of the priced lines). */
  subtotalCents: number;
  /** Promo discount from the promo engine; clamped to [0, subtotal]. */
  discountCents: number;
  collect: CollectMode;
  depositPct: number | null;
  payInPerson: boolean;
};

export type DueNow = {
  subtotalCents: number;
  discountCents: number;
  /** subtotal - discount: what the order is worth (`orders_total_is_derived`). */
  totalCents: number;
  /** What is credited to the order now (the deposit or the full total), before any card fee. */
  principalCents: number;
  /** What is still owed after the principal: the number emails and labels must show. */
  balanceCents: number;
};

export type PriceBreakdown = DueNow & {
  currency: string;
  lines: PricedLine[];
  /** What Checkout collects: the principal plus the pass-through card fee, when armed. */
  collectCents: number;
  cardFeeCents: number;
  collect: CollectMode;
  depositPct: number | null;
  payInPerson: boolean;
  /** E5: paid on the day, never in collectCents. */
  travelFeeOnDayCents: number;
};
