import "server-only";

import type { TalentPlanKey } from "@/lib/access/talent-membership";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { mapStripeStatus } from "@/lib/stripe/utils";
import { onTalentPlanChanged } from "@/lib/talent-site/server/plan-change";

const PRICE_TO_PLAN: Record<string, TalentPlanKey> = {
  talent_pro: "talent_pro",
  talent_portfolio: "talent_portfolio",
};

function planKeyFromSubscription(
  sub: import("stripe").Stripe.Subscription,
): TalentPlanKey | null {
  const meta = sub.metadata?.talent_plan_key;
  if (meta === "talent_pro" || meta === "talent_portfolio") {
    return meta;
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
 * Mirror Stripe talent subscription events to talent_subscriptions + talent_plan_key.
 */
export async function handleTalentStripeSubscriptionEvent(
  event: import("stripe").Stripe.Event,
): Promise<void> {
  const admin = createServiceRoleClient();
  if (!admin) return;

  const sub = event.data.object as import("stripe").Stripe.Subscription;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  const { data: talentSub } = await admin
    .from("talent_subscriptions")
    .select("talent_profile_id, plan_key")
    .eq("stripe_subscription_id", sub.id)
    .maybeSingle();

  let talentProfileId = (talentSub as { talent_profile_id?: string } | null)?.talent_profile_id;
  const previousPlan =
    ((talentSub as { plan_key?: string } | null)?.plan_key as TalentPlanKey | undefined) ??
    "talent_basic";

  if (!talentProfileId && sub.metadata?.talent_profile_id) {
    talentProfileId = sub.metadata.talent_profile_id;
  }

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
        .select("id, profile_code, talent_plan_key")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .maybeSingle();
      if (profile) {
        talentProfileId = (profile as { id: string }).id;
      }
    }
  }

  if (!talentProfileId) {
    return;
  }

  const { data: profileRow } = await admin
    .from("talent_profiles")
    .select("id, user_id, profile_code, talent_plan_key")
    .eq("id", talentProfileId)
    .maybeSingle();

  if (!profileRow) return;

  const profile = profileRow as {
    id: string;
    user_id: string;
    profile_code: string | null;
    talent_plan_key: string;
  };

  if (event.type === "customer.subscription.deleted") {
    await admin
      .from("talent_subscriptions")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("stripe_subscription_id", sub.id);

    await admin
      .from("talent_profiles")
      .update({ talent_plan_key: "talent_basic", updated_at: new Date().toISOString() })
      .eq("id", talentProfileId);

    await onTalentPlanChanged(
      talentProfileId,
      previousPlan,
      "talent_basic",
      profile.profile_code,
    );
    return;
  }

  const nextPlan = planKeyFromSubscription(sub);
  if (!nextPlan) return;

  const periodEndUnix =
    (sub.items.data[0] as { current_period_end?: number } | undefined)?.current_period_end ??
    null;

  await admin.from("talent_subscriptions").upsert(
    {
      talent_profile_id: talentProfileId,
      user_id: sub.metadata?.user_id ?? profile.user_id,
      stripe_subscription_id: sub.id,
      stripe_customer_id: customerId,
      plan_key: nextPlan,
      // QA 2026-06-13: map Stripe status to the canonical set. The old ternary
      // wrote raw sub.status for non-active/trialing — Stripe 'unpaid' (dunning
      // exhausted) then violated the talent_subscriptions.status CHECK (no
      // 'unpaid'), throwing on the webhook + looping retries. mapStripeStatus
      // maps unpaid→past_due / canceled→cancelled, all within the CHECK set,
      // and preserves 'trialing'.
      status: mapStripeStatus(sub.status),
      current_period_end: periodEndUnix
        ? new Date(periodEndUnix * 1000).toISOString()
        : null,
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "talent_profile_id" },
  );

  const fromPlan = (profile.talent_plan_key as TalentPlanKey) ?? "talent_basic";

  await admin
    .from("talent_profiles")
    .update({ talent_plan_key: nextPlan, updated_at: new Date().toISOString() })
    .eq("id", talentProfileId);

  if (sub.cancel_at_period_end && event.type === "customer.subscription.updated") {
    return;
  }

  await onTalentPlanChanged(talentProfileId, fromPlan, nextPlan, profile.profile_code);
}
