/**
 * lib/billing/record-discount-redemption.ts
 *
 * Count one code redemption when a subscription that carries a catalog coupon
 * starts, and hand out the entitlement half of a campaign exactly once.
 *
 * Extracted from `lib/stripe/webhook-handler.ts` (2026-09-02) because it is a
 * DISCOUNTS concern that happened to be triggered by a webhook, not part of the
 * webhook dispatcher itself. The handler had grown past the 800-line ceiling as
 * payout and dispute recording landed; moving this out was the honest fix,
 * rather than raising the budget or suppressing the rule.
 *
 * Behaviour is unchanged — this is a move, not a rewrite.
 *
 * Server-only.
 */

import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  extractSubscriptionDiscount,
  isUnexpandedDiscount,
} from "@/lib/billing/subscription-discounts";
import { applyCampaignGrantForDiscount } from "@/lib/billing/apply-campaign-grant";
import type Stripe from "stripe";

/**
 * Count one code redemption, if the subscription that just started carries one
 * of our catalog coupons.
 *
 * WHY: `product_discounts.redemption_count` was written by nothing. It sat at
 * zero forever, which meant `max_redemptions` was a number the admin could type
 * and the product would never honour — a "first 50 customers" campaign had no
 * fiftieth customer. `per_customer_limit` was the same promise, unkept for the
 * same reason. The `discount_redemptions` ledger is what makes both answerable.
 *
 * BEST EFFORT, ALWAYS. A ledger write must never 5xx a webhook: Stripe would
 * retry the whole event, and the money-side work above this line already
 * succeeded. Two layers of idempotency stand behind it — this branch is already
 * claimed by the event-level ledger, and the RPC's UNIQUE(stripe_event_id)
 * makes a replay a no-op even if the claim is bypassed.
 */
export async function recordDiscountRedemption(
  subscription: Stripe.Subscription,
  eventId: string,
): Promise<void> {
  try {
    const mirror = extractSubscriptionDiscount(subscription);
    if (!mirror || isUnexpandedDiscount(mirror) || !mirror.couponId) return;

    const tenantId = subscription.metadata?.tenant_id ?? null;
    const talentProfileId = subscription.metadata?.talent_profile_id ?? null;
    if (!tenantId && !talentProfileId) return;

    const sb = createServiceRoleClient();
    if (!sb) return;

    const { data: recorded, error } = await sb.rpc("record_discount_redemption", {
      p_stripe_coupon_id: mirror.couponId,
      p_stripe_event_id: eventId,
      p_subject_type: talentProfileId ? "talent" : "workspace",
      p_tenant_id: tenantId as string,
      p_talent_profile_id: talentProfileId as string,
      p_stripe_subscription_id: subscription.id,
      // WHO redeemed. Talent checkout has always stamped `user_id`; the
      // workspace side now does too. Older subscriptions carry no such
      // metadata, so this is null for them rather than wrong.
      p_user_id: subscription.metadata?.user_id ?? null,
    });
    if (error) logServerError("stripe-webhook.discount-redemption", error);

    // The entitlement half of a campaign, applied exactly once. `recorded` is
    // the RPC's own idempotency answer: true ONLY on the insert that actually
    // happened, so a replayed webhook cannot hand out a second free upgrade.
    // Workspace subjects only, and best-effort -- a courtesy grant that fails
    // must never fail the webhook that delivered the payment.
    if (recorded === true && tenantId) {
      const outcome = await applyCampaignGrantForDiscount({
        stripeCouponId: mirror.couponId,
        tenantId,
      });
      if (outcome.applied) {
        logServerError(
          "stripe-webhook.campaign-grant.applied",
          `tenant ${tenantId} granted ${outcome.planTier} until ${outcome.expiresAt}`,
        );
      }
    }
  } catch (err) {
    logServerError("stripe-webhook.discount-redemption", err);
  }
}
