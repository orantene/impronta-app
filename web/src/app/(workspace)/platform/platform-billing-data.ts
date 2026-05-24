/**
 * Platform HQ · per-person billing snapshot loader (D.1).
 *
 * Extracted to keep platform-data.ts under the 800-line cap.
 * Server-only, service-role client. Never import from a client component.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TalentSubscriptionInfo = {
  planKey: string;
  status: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

export type ClientSubscriptionInfo = {
  tier: string;
  status: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
};

export type TalentPlanOverrideInfo = {
  id: string;
  basePlanKey: string;
  overridePlanKey: string;
  expiresAt: string | null;
  reason: string | null;
  note: string | null;
  createdAt: string;
};

export type PersonBillingSnapshot = {
  /** Current effective plan key on talent_profiles (respects any active override). */
  talentProfilePlanKey: string | null;
  /** Active Stripe subscription for the talent profile, if any. */
  talentSubscription: TalentSubscriptionInfo | null;
  /** Active client-tier subscription, if any. */
  clientSubscription: ClientSubscriptionInfo | null;
  /** Active platform-admin talent plan override, if any. */
  activeTalentOverride: TalentPlanOverrideInfo | null;
};

// ─── Loader ───────────────────────────────────────────────────────────────────

/**
 * D.1 — Load billing snapshot for a platform user.
 * Pulls talent_subscriptions, talent_plan_overrides, and client_subscriptions.
 * Returns null when the service-role client is unavailable.
 */
export async function loadPersonBillingSnapshot(opts: {
  userId: string | null;
  talentProfileId: string | null;
}): Promise<PersonBillingSnapshot | null> {
  const sb = createServiceRoleClient();
  if (!sb) return null;

  const snapshot: PersonBillingSnapshot = {
    talentProfilePlanKey: null,
    talentSubscription: null,
    clientSubscription: null,
    activeTalentOverride: null,
  };

  // ── Talent subscription + profile plan key ─────────────────────────────────
  if (opts.talentProfileId) {
    const { data: talentPlan } = await sb
      .from("talent_profiles")
      .select("talent_plan_key")
      .eq("id", opts.talentProfileId)
      .maybeSingle();
    snapshot.talentProfilePlanKey =
      (talentPlan?.talent_plan_key as string | null) ?? "talent_basic";

    const { data: ts } = await sb
      .from("talent_subscriptions")
      .select(
        "plan_key, status, stripe_customer_id, stripe_subscription_id, current_period_end, cancel_at_period_end",
      )
      .eq("talent_profile_id", opts.talentProfileId)
      .maybeSingle();
    if (ts) {
      snapshot.talentSubscription = {
        planKey: ts.plan_key as string,
        status: ts.status as string,
        stripeCustomerId: ts.stripe_customer_id as string | null,
        stripeSubscriptionId: ts.stripe_subscription_id as string | null,
        currentPeriodEnd: ts.current_period_end as string | null,
        cancelAtPeriodEnd: Boolean(ts.cancel_at_period_end),
      };
    }

    // Active talent plan override
    const { data: ovr } = await sb
      .from("talent_plan_overrides")
      .select(
        "id, base_plan_key, override_plan_key, expires_at, reason, note, created_at",
      )
      .eq("talent_profile_id", opts.talentProfileId)
      .eq("status", "active")
      .maybeSingle();
    if (ovr) {
      snapshot.activeTalentOverride = {
        id: ovr.id as string,
        basePlanKey: ovr.base_plan_key as string,
        overridePlanKey: ovr.override_plan_key as string,
        expiresAt: ovr.expires_at as string | null,
        reason: ovr.reason as string | null,
        note: ovr.note as string | null,
        createdAt: ovr.created_at as string,
      };
    }
  }

  // ── Client subscription ────────────────────────────────────────────────────
  if (opts.userId) {
    const { data: cs } = await sb
      .from("client_subscriptions")
      .select(
        "tier, status, stripe_customer_id, stripe_subscription_id, current_period_end",
      )
      .eq("client_user_id", opts.userId)
      .maybeSingle();
    if (cs) {
      snapshot.clientSubscription = {
        tier: cs.tier as string,
        status: cs.status as string,
        stripeCustomerId: cs.stripe_customer_id as string | null,
        stripeSubscriptionId: cs.stripe_subscription_id as string | null,
        currentPeriodEnd: cs.current_period_end as string | null,
      };
    }
  }

  return snapshot;
}
