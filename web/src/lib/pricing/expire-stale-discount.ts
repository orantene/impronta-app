import "server-only";

/**
 * expire-stale-discount.ts (TUL-1860) · when a code is found past its end time, switch its Stripe promotion
 * code off. Codes minted before `expires_at` was sent to Stripe (and any code whose Stripe side drifted) would
 * otherwise still discount a typed Checkout code after the app already calls them expired.
 *
 * Best effort and idempotent (`active: false` can be sent twice). The sweep set keeps one server instance from
 * repeating the Stripe call on every request; a fresh instance simply repeats it once.
 */
import { discountStatus } from "@/lib/pricing/discount-status";
import { archiveDiscountInStripe } from "@/lib/pricing/stripe-discount-sync";
import type { PricingDiscountRow } from "@/lib/pricing/pricing-types";

const swept = new Set<string>();

export type ExpireDeps = {
  archive: (input: { stripePromotionCodeId: string | null }) => Promise<{ ok: boolean }>;
  swept: Set<string>;
};

export async function deactivateIfExpiredWith(
  deps: ExpireDeps,
  d: Pick<PricingDiscountRow, "isActive" | "startsAt" | "endsAt" | "stripePromotionCodeId">,
  nowMs: number = Date.now(),
): Promise<boolean> {
  const promoId = d.stripePromotionCodeId?.trim();
  if (!promoId || discountStatus(d, nowMs) !== "expired" || deps.swept.has(promoId)) return false;
  const res = await deps.archive({ stripePromotionCodeId: promoId });
  // Only remember a success, so a Stripe hiccup is retried on the next use.
  if (res.ok) deps.swept.add(promoId);
  return res.ok;
}

export function deactivateIfExpired(
  d: Pick<PricingDiscountRow, "isActive" | "startsAt" | "endsAt" | "stripePromotionCodeId">,
): Promise<boolean> {
  return deactivateIfExpiredWith({ archive: archiveDiscountInStripe, swept }, d).catch(() => false);
}

/** HQ list: sweep every expired row (capped, so one view cannot fan out into dozens of Stripe calls). */
export async function deactivateExpiredBatch(rows: PricingDiscountRow[], cap = 10): Promise<void> {
  let n = 0;
  for (const r of rows) {
    if (n >= cap) return;
    const promoId = r.stripePromotionCodeId?.trim();
    if (!promoId || swept.has(promoId) || discountStatus(r) !== "expired") continue;
    n += 1;
    await deactivateIfExpired(r);
  }
}
