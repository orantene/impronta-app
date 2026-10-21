import "server-only";

/**
 * TUL-1646: stop the automatic card charge of one month the owner recorded as paid outside Tulala. The month goes on the
 * plan's skip list FIRST (so a draft invoice created later is voided by the webhook), then any invoice that already
 * exists is voided in Stripe. Covers a plan whose checkout is still 'pending' (months from the first automatic period).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import type { StripeAccountKey } from "@/lib/stripe/client";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { voidAutopayMonth } from "./rent-autopay.server";
import type { RentPlan } from "./rent-cycle";

export async function skipAutopayForOutsideMonth(
  admin: SupabaseClient,
  p: {
    tenantId: string;
    plan: RentPlan;
    period: string;
    subscriptionId: string | null;
    platform: StripeAccountKey | null;
    skipPeriods: string[];
  },
  deps: { voidMonth?: typeof voidAutopayMonth } = {},
): Promise<boolean> {
  const live = ["pending", "active", "past_due", "paused"].includes(p.plan.autopayStatus ?? "off");
  if (!live || !p.plan.autopayFirstPeriod || p.period < p.plan.autopayFirstPeriod) return true; // not an automatic month
  const skip = [...new Set([...p.skipPeriods, p.period])];
  const { error } = await tenantScopedQuery(admin, "studio_rent_plans", p.tenantId).update({ autopay_skip_periods: skip }).eq("id", p.plan.id);
  if (error) {
    logServerError("rent.outside.skip", error);
    return false;
  }
  // Pending checkout, no subscription yet: the skip list alone protects the month.
  if (!p.subscriptionId) return true;
  return (deps.voidMonth ?? voidAutopayMonth)({ subscriptionId: p.subscriptionId, platform: p.platform, period: p.period });
}
