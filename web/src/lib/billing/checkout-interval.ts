/**
 * checkout-interval.ts: monthly / yearly selection for subscription Checkout
 * (TUL-830). Pure, so talent and workspace checkout share one rule set.
 *
 * Rules:
 *   - The interval arrives from the browser (the TUL-828 toggle). It is parsed
 *     with `parseBillingInterval`, so anything but "year" means monthly.
 *   - Yearly charges ONLY a catalog yearly price. When the catalog has none the
 *     checkout refuses with `yearly_unavailable`; it never falls back to the
 *     monthly price and never invents one. The UI hides yearly in that case
 *     (`yearlyCheckoutPlans`).
 *   - The idempotency key carries the interval for yearly, so switching the
 *     toggle and clicking again cannot replay the monthly session. Monthly keeps
 *     the historical key shape.
 */

import {
  parseBillingInterval,
  type BillingInterval,
} from "@/lib/pricing/interval-pricing";
import { catalogIntervalFor } from "@/lib/billing/talent-plan-change";
import type { BillingInterval as CatalogInterval } from "@/lib/stripe/price-ids";

export type CheckoutPriceResult =
  | { ok: true; priceId: string; interval: BillingInterval }
  | { ok: false; code: "yearly_unavailable" | "no_price" };

export type ResolveCatalogPrice = (interval: CatalogInterval) => Promise<string | null>;

export function toCatalogInterval(interval: BillingInterval): CatalogInterval {
  return catalogIntervalFor(interval);
}

export async function resolveCheckoutPrice(
  resolve: ResolveCatalogPrice,
  rawInterval: unknown,
): Promise<CheckoutPriceResult> {
  const interval = parseBillingInterval(rawInterval);
  const priceId = (await resolve(toCatalogInterval(interval)))?.trim() || null;
  if (priceId) return { ok: true, priceId, interval };
  return { ok: false, code: interval === "year" ? "yearly_unavailable" : "no_price" };
}

export function checkoutPriceError(
  code: "yearly_unavailable" | "no_price",
  planKey: string,
): string {
  return code === "yearly_unavailable"
    ? "Yearly billing is not available for this plan yet."
    : `No Stripe price configured for plan "${planKey}".`;
}

export function checkoutIdempotencyKey(input: {
  prefix: string;
  subjectId: string;
  planKey: string;
  interval: BillingInterval;
  suffix: string;
}): string {
  const tag = input.interval === "year" ? "_year" : "";
  return `${input.prefix}_${input.subjectId}_${input.planKey}${tag}${input.suffix}`;
}

/** Plan keys whose yearly catalog price exists, so the toggle may offer yearly. */
export async function yearlyCheckoutPlans<K extends string>(
  planKeys: readonly K[],
  resolveYearly: (planKey: K) => Promise<string | null>,
): Promise<K[]> {
  const found = await Promise.all(
    planKeys.map(async (k) => ((await resolveYearly(k))?.trim() ? k : null)),
  );
  return found.filter((k): k is K => k !== null);
}
