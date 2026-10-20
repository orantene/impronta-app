/**
 * trial-eligibility.server.ts (TUL-1280): wires the real service-role client
 * and Stripe client into the one-trial-per-user decision. Service role,
 * because checkout runs before the buyer can read billing rows; subject ids
 * always come from the session-scoped caller, never the browser.
 */
import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import { logServerError } from "@/lib/server/safe-error";
import { decideCheckoutTrialDays, type TrialOfferLike } from "./trial-eligibility";
import {
  readStripeSubscriptionHistory,
  readSubjectHistory,
  type HistoryDb,
  type HistoryStripe,
  type TrialHistorySubject,
} from "./trial-eligibility-readers";

export type { TrialHistorySubject };

function dbReader(subject: TrialHistorySubject) {
  return async () => {
    if (subject.kind === "workspace" && !subject.buyerUserId) {
      // Per-workspace history only: the cross-workspace rule needs the buyer.
      logServerError("billing.trialEligibility.noBuyerUserId", new Error(`tenant ${subject.tenantId}`));
    }
    const sb = createServiceRoleClient() as unknown as HistoryDb | null;
    return sb ? readSubjectHistory(sb, subject) : { data: null, error: new Error("Database not available.") };
  };
}

/** `trial_period_days` for this checkout, or null (offer off, prior trial/subscription, or a failed read). */
export async function checkoutTrialDays(
  subject: TrialHistorySubject,
  customerId: string,
  offer: TrialOfferLike,
): Promise<number | null> {
  const stripe = getStripe() as unknown as HistoryStripe | null;
  return decideCheckoutTrialDays(offer, {
    readDbHistory: dbReader(subject),
    readStripeHistory: async () => {
      if (!stripe) return { data: null, error: new Error("Stripe is not configured.") };
      return readStripeSubscriptionHistory(stripe, customerId);
    },
    onError: logServerError,
  });
}

/**
 * The trial days a surface may PROMISE (trial door, plan cards): the same rule
 * from our DB only, no Stripe call. 0 = no trial, so the copy says "charged today".
 */
export async function displayTrialDays(subject: TrialHistorySubject, offer: TrialOfferLike): Promise<number> {
  const days = await decideCheckoutTrialDays(offer, {
    readDbHistory: dbReader(subject),
    readStripeHistory: null,
    onError: logServerError,
  });
  return days ?? 0;
}
