/**
 * talent-subscription-lifecycle.ts — self-serve cancel and resume for a talent's
 * personal-page subscription (TUL-832).
 *
 * Workspaces already had this (`lib/server-actions/cancel-subscription.ts`);
 * talents could only reach the Stripe portal. The rules are the same:
 *
 *   - Cancel = `cancel_at_period_end: true` AT STRIPE. The plan keeps working
 *     until the paid period ends; nothing is refunded, nothing is ended now.
 *   - Resume = `cancel_at_period_end: false`. Refused once Stripe reports the
 *     subscription ended: the honest answer then is a new checkout.
 *   - OWNERSHIP: the row is loaded by the server-resolved talent profile id and
 *     must belong to the signed-in user. The caller never passes a subscription
 *     id, so a browser cannot point this at someone else's plan.
 *
 * Pure decision + dependency-injected runner, so the authorization and the
 * "reach Stripe, then mirror" order are testable without Stripe or a database.
 */

export type TalentLifecycleAction = "cancel" | "resume";

export type TalentSubscriptionRow = {
  user_id: string | null;
  stripe_subscription_id: string | null;
  status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
};

export type TalentLifecycleDecision =
  | { kind: "stripe"; cancelAtPeriodEnd: boolean }
  | { kind: "noop"; periodEnd: string | null }
  | { kind: "error"; code: TalentLifecycleErrorCode };

export type TalentLifecycleErrorCode =
  | "not_found"
  | "no_subscription"
  | "already_ended"
  | "unavailable"
  | "stripe_failed";

const ENDED = new Set(["canceled", "cancelled", "incomplete_expired"]);

/** What to do for this row, this caller, this action. No I/O. */
export function decideTalentLifecycle(
  row: TalentSubscriptionRow | null,
  callerUserId: string,
  action: TalentLifecycleAction,
): TalentLifecycleDecision {
  // A row owned by someone else is reported exactly like a missing row: the
  // caller learns nothing about other people's plans.
  if (!row || !callerUserId || row.user_id !== callerUserId) {
    return { kind: "error", code: "not_found" };
  }
  if (!row.stripe_subscription_id) return { kind: "error", code: "no_subscription" };

  const ended = ENDED.has(row.status ?? "");
  if (action === "cancel") {
    if (ended || row.cancel_at_period_end) {
      return { kind: "noop", periodEnd: row.current_period_end };
    }
    return { kind: "stripe", cancelAtPeriodEnd: true };
  }
  if (ended) return { kind: "error", code: "already_ended" };
  if (!row.cancel_at_period_end) return { kind: "noop", periodEnd: row.current_period_end };
  return { kind: "stripe", cancelAtPeriodEnd: false };
}

export type TalentLifecycleDeps = {
  loadRow: (talentProfileId: string) => Promise<TalentSubscriptionRow | null>;
  /** Sets the flag at Stripe; returns the period end (ISO) Stripe reports, if any. */
  setStripeCancelFlag: (subscriptionId: string, cancelAtPeriodEnd: boolean) => Promise<string | null>;
  /** Mirrors the flag locally so the UI reflects it before the webhook lands. */
  mirror: (talentProfileId: string, cancelAtPeriodEnd: boolean) => Promise<void>;
};

export type TalentLifecycleResult =
  | { ok: true; cancelAtPeriodEnd: boolean; periodEnd: string | null }
  | { ok: false; code: TalentLifecycleErrorCode };

export async function runTalentLifecycle(
  deps: TalentLifecycleDeps,
  input: { talentProfileId: string; callerUserId: string; action: TalentLifecycleAction },
): Promise<TalentLifecycleResult> {
  const row = await deps.loadRow(input.talentProfileId);
  const decision = decideTalentLifecycle(row, input.callerUserId, input.action);
  if (decision.kind === "error") return { ok: false, code: decision.code };
  if (decision.kind === "noop") {
    return { ok: true, cancelAtPeriodEnd: input.action === "cancel", periodEnd: decision.periodEnd };
  }

  let periodEnd: string | null;
  try {
    periodEnd = await deps.setStripeCancelFlag(row!.stripe_subscription_id!, decision.cancelAtPeriodEnd);
  } catch {
    // Stripe said no: do NOT mirror, or the UI would claim a change that
    // never happened.
    return { ok: false, code: "stripe_failed" };
  }
  await deps.mirror(input.talentProfileId, decision.cancelAtPeriodEnd);
  return {
    ok: true,
    cancelAtPeriodEnd: decision.cancelAtPeriodEnd,
    periodEnd: periodEnd ?? row!.current_period_end,
  };
}
