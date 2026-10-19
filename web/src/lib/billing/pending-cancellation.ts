/**
 * lib/billing/pending-cancellation.ts
 *
 * One rule for "this subscription is set to end", shared by the talent and
 * workspace subscription syncs and the Billing panel. DISPLAY only: nothing
 * here touches amounts, prices or plans.
 *
 * Why: with Stripe API 2026-04-22.dahlia the billing portal cancels by setting
 * `cancel_at` (the period or trial end) and leaves `cancel_at_period_end`
 * false. Copying only the flag left the mirror saying "renews" for a
 * subscription that will never charge again. Pure: no Stripe or Supabase
 * imports.
 */

type CancelFields = {
  cancel_at_period_end?: boolean | null;
  /** Unix seconds, null when no end is scheduled. */
  cancel_at?: number | null;
};

/** True when Stripe will end the subscription at a future moment. */
export function isCancellationPending(sub: CancelFields, now: Date = new Date()): boolean {
  if (sub.cancel_at_period_end === true) return true;
  const at = sub.cancel_at;
  return typeof at === "number" && at > Math.floor(now.getTime() / 1000);
}

/**
 * The cancel columns a subscription row stores. The row has no cancel-date
 * column; the end date shown is `current_period_end`, which is where the
 * portal and the in-app cancel both put `cancel_at`.
 */
export function subscriptionCancelMirror(
  sub: CancelFields,
  now: Date = new Date(),
): { cancel_at_period_end: boolean } {
  return { cancel_at_period_end: isCancellationPending(sub, now) };
}

/**
 * The ONE param Stripe accepts to undo a pending cancellation. Stripe rejects
 * a request carrying both `cancel_at_period_end` and `cancel_at`. An app-style
 * cancel sets the flag (Stripe then also reports `cancel_at`), so the flag
 * wins; a portal-style cancel leaves the flag false and only `cancel_at`
 * is set, which is cleared with an empty string.
 */
export function resumeSubscriptionParams(
  sub: CancelFields,
): { cancel_at_period_end: false } | { cancel_at: "" } {
  if (sub.cancel_at_period_end !== true && sub.cancel_at != null) return { cancel_at: "" };
  return { cancel_at_period_end: false };
}

/** English source label for the date row in the Billing panel (ES in dashboard-i18n-billing). */
export function billingDateLabel(cancellationPending: boolean): "Ends on" | "Next charge" {
  return cancellationPending ? "Ends on" : "Next charge";
}
