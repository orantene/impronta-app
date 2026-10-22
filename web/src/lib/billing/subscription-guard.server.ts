/**
 * TUL-830 · server read behind the duplicate-subscription rule. Service role,
 * because checkout runs before the person has any billing rows they can read.
 * The subject id always comes from the session-scoped caller, never the browser.
 */
import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import {
  ALREADY_SUBSCRIBED_ERROR,
  checkoutGuardError,
  classifyExistingSubscription,
  hasLiveTalentStripeSubscription,
} from "./duplicate-subscription";

/** null = checkout may proceed; otherwise the refusal to return. */
export async function duplicateSubscriptionGuard(
  kind: "talent" | "workspace",
  subjectId: string,
  /** Talent only: the auth user, used to find their Stripe customer. */
  userId?: string,
): Promise<string | null> {
  const sb = createServiceRoleClient();
  if (!sb) return checkoutGuardError("unknown");
  const read =
    kind === "talent"
      ? await sb.from("talent_subscriptions").select("status").eq("talent_profile_id", subjectId).maybeSingle()
      : await sb.from("workspace_subscriptions").select("status").eq("tenant_id", subjectId).maybeSingle();
  if (read.error) logServerError("billing.duplicateSubscriptionGuard", read.error);
  const fromDb = checkoutGuardError(
    classifyExistingSubscription({ data: read.data as { status?: string | null } | null, error: read.error }),
  );
  if (fromDb || kind !== "talent" || !userId) return fromDb;

  // TUL-1835: also ask Stripe, so a stale or overwritten row cannot let a second
  // subscription through. Fails closed.
  if (!isStripeConfigured()) return null;
  const stripe = getStripe();
  if (!stripe) return null;
  try {
    const cust = await sb.from("talent_stripe_customers").select("stripe_customer_id").eq("user_id", userId).maybeSingle();
    const customerId = (cust.data as { stripe_customer_id?: string | null } | null)?.stripe_customer_id;
    if (!customerId) return null;
    const list = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
    if (hasLiveTalentStripeSubscription(list.data)) return ALREADY_SUBSCRIBED_ERROR;
    return null;
  } catch (err) {
    logServerError("billing.duplicateSubscriptionGuard.stripe", err);
    return checkoutGuardError("unknown");
  }
}
