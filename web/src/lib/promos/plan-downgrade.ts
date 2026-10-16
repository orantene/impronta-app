import { downgradeOutcome, downgradeSummary } from "./safe-edit";
import type { Promo, PromoStatus } from "./types";

/**
 * Lazy downgrade (design L7). There is no single "plan dropped" hook (Stripe
 * webhook, admin billing, trial expiry and the reconcile cron all write
 * `talent_plan_key`), so the rule is applied wherever promos are read: a free
 * talent's paid-only promos are treated as ended (scheduled ones as drafts).
 * Kept: the lifetime trial promo and personal offers already sent.
 * Bookings already made are untouched: their price is snapshotted.
 */
export function effectiveStatus(promo: Promo, status: PromoStatus, plan: "free" | "paid", now: string | Date): PromoStatus {
  if (plan === "paid") return status;
  const o = downgradeOutcome(promo, status, now);
  if (o.action === "end_on") return "expired";
  if (o.action === "to_draft") return "draft";
  return status;
}

/** How many promos the free plan just ended or reverted to draft, for a one-line notice. */
export function planEndedCount(items: readonly { promo: Promo; status: PromoStatus }[], plan: "free" | "paid", now: string | Date): number {
  if (plan === "paid") return 0;
  const s = downgradeSummary(items, now);
  return s.endingCount + s.toDraftCount;
}
