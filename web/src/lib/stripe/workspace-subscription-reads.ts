/**
 * lib/stripe/workspace-subscription-reads.ts
 *
 * Read-only workspace subscription lookups, split out of workspace-billing.ts
 * (file-size budget). workspace-billing.ts re-exports everything here, so
 * existing imports are unchanged.
 */
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export type WorkspaceSubscriptionState = {
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  planKey: string;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  cancelledAt: string | null;
  trialEnd: string | null;
  stripePriceId: string | null;
  pastDueSince?: string | null;
};

/**
 * Does this workspace have a live Stripe subscription? Used to refuse a
 * paid-to-paid tier change that we cannot yet perform correctly, rather than
 * writing the tier locally and leaving Stripe billing the old price.
 */
export async function hasLiveWorkspaceSubscription(tenantId: string): Promise<boolean> {
  const admin = createServiceRoleClient();
  if (!admin) return false;
  const { data, error } = await admin
    .from("workspace_subscriptions")
    .select("stripe_subscription_id, status")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  // Fail closed: an unreadable row must not look like "no subscription"
  // (that would allow a second live subscription).
  if (error) throw error;
  const row = data as { stripe_subscription_id?: string | null; status?: string | null } | null;
  if (!row?.stripe_subscription_id) return false;
  return !["canceled", "cancelled", "incomplete_expired"].includes(String(row.status ?? ""));
}

/**
 * Load the current subscription state for a tenant. Returns null when the
 * tenant has no active Stripe subscription (free tier).
 *
 * Intended for server-side read in the Account page via data bridge.
 * Reads with the user's RLS context — agency staff can see their own row.
 */
export async function loadWorkspaceSubscriptionState(
  tenantId: string,
  supabase: import("@supabase/supabase-js").SupabaseClient,
): Promise<WorkspaceSubscriptionState | null> {
  try {
    const { data, error } = await supabase
      .from("workspace_subscriptions")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) {
      logServerError("workspace-billing.loadState", error);
      return null;
    }
    if (!data) return null;

    type Row = {
      stripe_subscription_id: string;
      stripe_customer_id: string;
      plan_key: string;
      status: string;
      current_period_start: string | null;
      current_period_end: string | null;
      cancel_at_period_end: boolean;
      cancelled_at: string | null;
      trial_end: string | null;
      stripe_price_id: string | null;
      past_due_since?: string | null;
    };
    const row = data as unknown as Row;
    return {
      stripeSubscriptionId: row.stripe_subscription_id,
      stripeCustomerId: row.stripe_customer_id,
      planKey: row.plan_key,
      status: row.status,
      currentPeriodStart: row.current_period_start,
      currentPeriodEnd: row.current_period_end,
      cancelAtPeriodEnd: row.cancel_at_period_end,
      cancelledAt: row.cancelled_at,
      trialEnd: row.trial_end,
      stripePriceId: row.stripe_price_id,
      pastDueSince: row.past_due_since ?? null,
    };
  } catch (err) {
    logServerError("workspace-billing.loadState", err);
    return null;
  }
}
