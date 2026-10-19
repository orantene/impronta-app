/**
 * trial-eligibility.ts (TUL-1280): one free trial per customer.
 *
 * Checkout used to add `trial_period_days` whenever the admin trial offer was
 * on, so a talent (or workspace) could cancel and check out again for another
 * trial, indefinitely. This module decides whether THIS checkout may carry the
 * offered trial. It never changes the price, the discount or the trial length:
 * it only answers "offered days" or "no trial".
 *
 * Sources of truth, in order:
 *   1. our own subscription rows: one trial per USER across talent and every
 *      workspace they joined (see trial-eligibility-readers.ts)
 *   2. the Stripe customer's subscription list (status "all"; checkout only,
 *      one retry); display surfaces pass no Stripe reader
 * Fail CLOSED: a read that errors grants NO trial (checkout still proceeds,
 * the buyer simply pays from day one). Pure apart from the injected readers.
 */

/** Statuses that prove a subscription existed beyond a failed first payment. */
const PRIOR_STATUSES = new Set([
  "trialing",
  "active",
  "past_due",
  "cancelled",
  "canceled",
  "paused",
  "unpaid",
]);

export type TrialOfferLike = { isEnabled: boolean; trialDays: number } | null | undefined;

/** Our DB row shape (talent_subscriptions / workspace_subscriptions). */
export type SubscriptionHistoryRow = { status?: string | null; trial_end?: string | null };

/** The fields we read from a Stripe subscription. */
export type StripeSubscriptionLite = {
  status?: string | null;
  trial_start?: number | null;
  trial_end?: number | null;
};

export type HistoryRead<T> = { data: T[] | null; error: unknown };

/** The admin offer's trial length, or null when the offer is off. Unchanged rule. */
export function offeredTrialDays(offer: TrialOfferLike): number | null {
  return offer?.isEnabled && offer.trialDays > 0 ? offer.trialDays : null;
}

function hadPrior(status: string | null | undefined, trialMarker: unknown): boolean {
  if (trialMarker != null) return true;
  return status != null && PRIOR_STATUSES.has(status);
}

/** Any DB row with a trial ever set, or any status past a failed first payment. */
export function dbShowsPriorSubscription(rows: SubscriptionHistoryRow[] | null): boolean {
  return (rows ?? []).some((r) => hadPrior(r.status, r.trial_end));
}

/** Any Stripe subscription that trialed, or that got past a failed first payment. */
export function stripeShowsPriorSubscription(subs: StripeSubscriptionLite[] | null): boolean {
  return (subs ?? []).some((s) => hadPrior(s.status, s.trial_start ?? s.trial_end));
}

/**
 * The `subscription_data` fragment Checkout receives: the trial key only when
 * eligible, never `trial_period_days: undefined` / `null` / 0.
 */
export function trialParams(days: number | null): { trial_period_days?: number } {
  return days != null && days > 0 ? { trial_period_days: days } : {};
}

export type TrialEligibilityDeps = {
  readDbHistory: () => Promise<HistoryRead<SubscriptionHistoryRow>>;
  /** null when there is no Stripe customer to read (nothing to check). */
  readStripeHistory: (() => Promise<HistoryRead<StripeSubscriptionLite>>) | null;
  onError: (where: string, err: unknown) => void;
};

async function safeRead<T>(read: () => Promise<HistoryRead<T>>): Promise<HistoryRead<T>> {
  try {
    return await read();
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * The `trial_period_days` this checkout may send, or null for none.
 * Reads only when the offer is on; stops at the first source that shows a
 * prior subscription or fails.
 */
export async function decideCheckoutTrialDays(
  offer: TrialOfferLike,
  deps: TrialEligibilityDeps,
): Promise<number | null> {
  const days = offeredTrialDays(offer);
  if (days == null) return null;

  const db = await safeRead(deps.readDbHistory);
  if (db.error) {
    deps.onError("billing.trialEligibility.db", db.error);
    return null;
  }
  if (dbShowsPriorSubscription(db.data)) return null;

  if (deps.readStripeHistory) {
    // One retry on a transient Stripe error before failing closed.
    let stripe = await safeRead(deps.readStripeHistory);
    if (stripe.error) stripe = await safeRead(deps.readStripeHistory);
    if (stripe.error) {
      deps.onError("billing.trialEligibility.stripe", stripe.error);
      return null;
    }
    if (stripeShowsPriorSubscription(stripe.data)) return null;
  }
  return days;
}
