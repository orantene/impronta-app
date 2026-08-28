/**
 * discount-ending-window.ts — which lapsing discounts deserve a warning today.
 *
 * Pure and dependency-free so the date arithmetic can be tested without a
 * database or a clock. The cron route owns the I/O; this owns the judgement.
 */

export type SubscriptionDiscountRow = {
  tenant_id?: string | null;
  talent_profile_id?: string | null;
  stripe_subscription_id: string | null;
  plan_key: string | null;
  status: string | null;
  discount_ends_at: string | null;
};

/**
 * Rows whose discount lapses within `withinDays` from `now`.
 *
 * Deliberately EXCLUDES discounts that have already lapsed: a warning that
 * arrives after the larger invoice is worse than no warning, because it reads
 * as an apology for something the reader has already been surprised by. Also
 * excludes unparseable dates rather than guessing at them — a bad timestamp
 * should mean "no mail", never "mail everyone".
 */
export function selectDiscountsEndingSoon<T extends SubscriptionDiscountRow>(
  rows: T[],
  now: Date,
  withinDays: number,
): T[] {
  const nowMs = now.getTime();
  const horizonMs = nowMs + withinDays * 24 * 60 * 60 * 1000;

  return rows.filter((row) => {
    if (!row.discount_ends_at || !row.stripe_subscription_id) return false;
    const endsMs = Date.parse(row.discount_ends_at);
    if (Number.isNaN(endsMs)) return false;
    return endsMs > nowMs && endsMs <= horizonMs;
  });
}
