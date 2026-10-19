/**
 * trial-eligibility.server.ts (TUL-1280): wires the real service-role client
 * and Stripe client into the one-trial-per-customer decision. Service role,
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
  readTalentSubscriptionHistory,
  readWorkspaceSubscriptionHistory,
  type HistoryDb,
  type HistoryStripe,
} from "./trial-eligibility-readers";

export type CheckoutTrialSubject =
  | { kind: "talent"; talentProfileId: string; userId: string }
  | { kind: "workspace"; tenantId: string };

/** `trial_period_days` for this checkout, or null (offer off, prior subscription, or a failed read). */
export async function checkoutTrialDays(
  subject: CheckoutTrialSubject,
  customerId: string,
  offer: TrialOfferLike,
): Promise<number | null> {
  const sb = createServiceRoleClient() as unknown as HistoryDb | null;
  const stripe = getStripe() as unknown as HistoryStripe | null;
  return decideCheckoutTrialDays(offer, {
    readDbHistory: async () => {
      if (!sb) return { data: null, error: new Error("Database not available.") };
      return subject.kind === "talent"
        ? readTalentSubscriptionHistory(sb, subject)
        : readWorkspaceSubscriptionHistory(sb, subject.tenantId);
    },
    readStripeHistory: async () => {
      if (!stripe) return { data: null, error: new Error("Stripe is not configured.") };
      return readStripeSubscriptionHistory(stripe, customerId);
    },
    onError: logServerError,
  });
}
