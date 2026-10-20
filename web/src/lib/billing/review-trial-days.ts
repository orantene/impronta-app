/**
 * review-trial-days.ts (TUL-1285): the trial days /get-started/review may show.
 *
 * Logged out: the configured offer, unchanged. Signed in: the same
 * one-trial-per-user rule as Checkout and the trial door (DB only, no Stripe),
 * so a returning user sees the plain monthly price instead of "N días gratis".
 * A failed read fails closed (no trial text). Pure apart from the injected read.
 */

type PlanTrial = { trialEnabled: boolean; trialDays: number | null } | null;
type EligibleDays = (userId: string, offer: { isEnabled: boolean; trialDays: number }) => Promise<number>;

export async function shownTrialDays(
  plan: PlanTrial,
  userId: string | null,
  eligibleDays: EligibleDays,
): Promise<number | null> {
  if (!plan?.trialEnabled || !plan.trialDays || plan.trialDays <= 0) return null;
  if (!userId) return plan.trialDays;
  try {
    const days = await eligibleDays(userId, { isEnabled: true, trialDays: plan.trialDays });
    return days > 0 ? days : null;
  } catch {
    return null;
  }
}
