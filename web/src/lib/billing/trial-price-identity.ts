/**
 * trial-price-identity.ts (TUL-1280 money review P1, wrong price): what a
 * trial Checkout session actually charges, as one comparable string.
 *
 * The race reconcile may hand a losing request the WINNER's Checkout only when
 * the winner charges exactly what this request asked for. plan_key alone is
 * not enough: the same plan differs by interval (month vs year), price id
 * (which fixes the currency, e.g. USD vs MXN) and discount (promo code or
 * coupon). Stamped on trial sessions' metadata (additive key; amounts, line
 * items and coupons unchanged) and compared by the reconcile. Pure.
 */
import { createHash } from "node:crypto";

import { stableParamsJson } from "./checkout-session-key";

export const TRIAL_PRICE_IDENTITY = "trial_price_identity";

/** `<plan>|<interval>|<price id>|d:<8 hex of the discount params>` (well under Stripe's 500-char metadata cap). */
export function trialPriceIdentity(input: {
  planKey: string;
  interval: string;
  priceId: string;
  discount: unknown;
}): string {
  const d = createHash("sha256").update(stableParamsJson(input.discount ?? null)).digest("hex").slice(0, 8);
  return `${input.planKey}|${input.interval}|${input.priceId}|d:${d}`;
}
