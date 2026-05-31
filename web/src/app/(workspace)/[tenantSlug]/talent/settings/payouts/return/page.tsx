/**
 * Talent Stripe Connect onboarding return route. Stripe redirects here after
 * the talent finishes (or abandons) the hosted onboarding flow. We pull the
 * latest account status from Stripe so the talent sees fresh state right away
 * (rather than waiting on the async account.updated webhook), then redirect
 * back to the Payouts settings page.
 *
 * Mirrors the workspace return route (/admin/payouts/return). Arriving here
 * does not necessarily mean onboarding succeeded — Stripe redirects on both
 * completion and abandonment; the refreshed status surfaces the right state.
 */

import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { refreshTalentAccountStatus } from "@/lib/payments/stripe-connect-talent";
import { logServerError } from "@/lib/server/safe-error";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

export default async function TalentPayoutsReturnPage({
  params,
}: {
  params: PageParams;
}) {
  const { tenantSlug } = await params;

  // Best-effort refresh. If Stripe is unreachable the redirect still goes
  // through and the webhook reconciles status shortly after.
  try {
    const session = await getCachedActorSession();
    const supabase = await createSupabaseServerClient();
    if (session.user && supabase) {
      const { data: tp } = await supabase
        .from("talent_profiles")
        .select("id")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (tp?.id) await refreshTalentAccountStatus(tp.id as string);
    }
  } catch (err) {
    logServerError("talent.payouts.return.refresh", err);
  }

  redirect(`/${tenantSlug}/talent/settings/payouts?ok=1`);
}
