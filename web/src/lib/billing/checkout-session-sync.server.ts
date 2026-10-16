/**
 * TUL-836 session sync · server half. Reads the Checkout session and its
 * subscription from Stripe (TEST or live per the configured key; no prices are
 * touched) and hands the subscription to the single plan-state writer,
 * `syncTalentSubscriptionToDb`, exactly as the webhook does. The writer is
 * idempotent, so a late webhook replaying the same subscription is harmless.
 *
 * The owner comes from the signed-in session (caller passes the profile it
 * loaded for that user); the session id from the URL is only a pointer.
 */
import "server-only";

import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { syncTalentSubscriptionToDb } from "@/lib/stripe/talent-billing";
import { logServerError } from "@/lib/server/safe-error";
import { decideCheckoutSessionSync, isCheckoutSessionId, type CheckoutSessionLike } from "./checkout-session-sync";

export async function syncTalentCheckoutSession(input: {
  sessionId: unknown;
  ownerProfileId: string;
  ownerUserId: string;
}): Promise<{ synced: boolean }> {
  if (!isCheckoutSessionId(input.sessionId) || !isStripeConfigured()) return { synced: false };
  const stripe = getStripe();
  if (!stripe) return { synced: false };
  try {
    const session = await stripe.checkout.sessions.retrieve(input.sessionId);
    const decision = decideCheckoutSessionSync({
      session: session as unknown as CheckoutSessionLike,
      ownerProfileId: input.ownerProfileId,
      ownerUserId: input.ownerUserId,
    });
    if (!decision.ok) return { synced: false };
    const subscription = await stripe.subscriptions.retrieve(decision.subscriptionId);
    const result = await syncTalentSubscriptionToDb(subscription, decision.planKey, {
      eventType: "sync",
      talentProfileId: input.ownerProfileId,
      userId: input.ownerUserId,
    });
    if (!result.ok) logServerError("billing.checkoutSessionSync", result.error);
    return { synced: result.ok };
  } catch (err) {
    logServerError("billing.checkoutSessionSync", err);
    return { synced: false };
  }
}
