import "server-only";

import type { TalentPlanKey } from "@/lib/access/talent-membership";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { syncTalentSubscriptionToDb } from "@/lib/stripe/talent-billing";
import type { BillingResult } from "@/lib/stripe/workspace-billing";

const PRICE_TO_PLAN: Record<string, TalentPlanKey> = {
  talent_pro: "talent_pro",
  talent_portfolio: "talent_portfolio",
};

function planKeyFromSubscription(
  sub: import("stripe").Stripe.Subscription,
): TalentPlanKey | null {
  // plan_key is what our checkout (and TUL-831 plan change) writes;
  // talent_plan_key is the older tag.
  for (const meta of [sub.metadata?.plan_key, sub.metadata?.talent_plan_key]) {
    if (meta === "talent_pro" || meta === "talent_portfolio") return meta;
  }
  const priceId = sub.items.data[0]?.price?.id;
  if (priceId) {
    for (const [key, plan] of Object.entries(PRICE_TO_PLAN)) {
      if (priceId.includes(key)) return plan;
    }
  }
  const productId = sub.items.data[0]?.price?.product;
  if (typeof productId === "string") {
    if (productId.includes("portfolio")) return "talent_portfolio";
    if (productId.includes("pro")) return "talent_pro";
  }
  return null;
}

/**
 * Route a talent customer.subscription.created/updated/deleted event into the
 * single plan-state writer (TUL-836). This function only resolves WHO the
 * subscription belongs to (legacy subscriptions can lack metadata); all row
 * and plan writes happen in syncTalentSubscriptionToDb.
 */
export async function handleTalentStripeSubscriptionEvent(
  event: import("stripe").Stripe.Event,
): Promise<BillingResult<void>> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Database not available." };

  const sub = event.data.object as import("stripe").Stripe.Subscription;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  const { data: talentSub } = await admin
    .from("talent_subscriptions")
    .select("talent_profile_id, plan_key")
    .eq("stripe_subscription_id", sub.id)
    .maybeSingle();
  const stored = talentSub as { talent_profile_id?: string; plan_key?: string } | null;

  let talentProfileId: string | undefined = stored?.talent_profile_id ?? sub.metadata?.talent_profile_id;

  if (!talentProfileId) {
    const { data: byCustomer } = await admin
      .from("talent_stripe_customers")
      .select("user_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    const userId = (byCustomer as { user_id?: string } | null)?.user_id;
    if (userId) {
      const { data: profile } = await admin
        .from("talent_profiles")
        .select("id")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .maybeSingle();
      talentProfileId = (profile as { id?: string } | null)?.id;
    }
  }
  // Not ours to sync (no talent behind it): ack, nothing to retry.
  if (!talentProfileId) return { ok: true, data: undefined };

  const { data: profileRow } = await admin
    .from("talent_profiles")
    .select("user_id")
    .eq("id", talentProfileId)
    .maybeSingle();
  const userId = (profileRow as { user_id?: string } | null)?.user_id;
  if (!userId) return { ok: true, data: undefined };

  const planKey = planKeyFromSubscription(sub) ?? stored?.plan_key ?? "talent_pro";
  return syncTalentSubscriptionToDb(sub, planKey, {
    eventType: event.type,
    talentProfileId,
    userId: sub.metadata?.user_id ?? userId,
  });
}
