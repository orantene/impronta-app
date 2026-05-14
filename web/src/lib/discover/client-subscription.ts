import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

/**
 * D6 — client subscription tier helper.
 *
 * Drives Discover power-tool gating. Tiers per project_discover_unified.md §4.2:
 *   standard   — free baseline (browse + favorites + 1 shortlist + single inquiry)
 *   pro        — paid power tools (compare, multi-talent inquiry, etc.)
 *   enterprise — Pro + API + dedicated rep + bulk RFPs + white-label
 *
 * Missing row defaults to 'standard'. Status non-active also defaults
 * down so a paused/canceled subscription doesn't leave the client with
 * Pro features they're no longer paying for.
 */

export type ClientSubscriptionTier = "standard" | "pro" | "enterprise";

export type ClientSubscription = {
  tier: ClientSubscriptionTier;
  status: "active" | "past_due" | "canceled" | "trialing" | "incomplete" | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

/** Default for users with no row OR a non-active subscription. */
const STANDARD: ClientSubscription = {
  tier: "standard",
  status: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
};

export async function loadClientSubscription(
  userId: string,
): Promise<ClientSubscription> {
  if (!userId) return STANDARD;
  const admin = createServiceRoleClient();
  if (!admin) return STANDARD;

  const { data, error } = await admin
    .from("client_subscriptions")
    .select("tier, status, current_period_end, cancel_at_period_end")
    .eq("client_user_id", userId)
    .maybeSingle();

  if (error) {
    logServerError("discover.loadClientSubscription", error);
    return STANDARD;
  }
  if (!data) return STANDARD;

  // Only active or trialing subscriptions grant the upgraded tier. Anything
  // else (canceled, past_due, incomplete) silently downgrades to standard
  // until Stripe webhook reactivates the row.
  const status = data.status as ClientSubscription["status"];
  const isLive = status === "active" || status === "trialing";
  const tier = (data.tier as ClientSubscriptionTier | null) ?? "standard";

  return {
    tier: isLive ? tier : "standard",
    status: status ?? null,
    currentPeriodEnd: (data.current_period_end as string | null) ?? null,
    cancelAtPeriodEnd: Boolean(data.cancel_at_period_end),
  };
}

/** Convenience: a single capability check. Future: refactor into a
 *  capability matrix when more gates accumulate. */
export function canUsePro(sub: ClientSubscription): boolean {
  return sub.tier === "pro" || sub.tier === "enterprise";
}
