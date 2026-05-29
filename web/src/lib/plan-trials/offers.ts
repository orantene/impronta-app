/**
 * Plan Trials — server-side reads of the admin-editable `plan_trial_offers`
 * catalog (default trial length + self-serve CTA copy per plan).
 *
 * Server-only (imports the service-role client). Client components must import
 * the pure engine from `@/lib/plan-trials` instead — never this file.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export type TrialAudience = "workspace" | "talent";

export type TrialOffer = {
  audience: TrialAudience;
  planKey: string;
  trialDays: number;
  /** Whether the self-serve upgrade/trial CTA for this plan is shown at all. */
  isEnabled: boolean;
  ctaHeadline: string | null;
  ctaSubtext: string | null;
};

const SELECT = "audience, plan_key, trial_days, is_enabled, cta_headline, cta_subtext";

function normalize(row: {
  audience: string;
  plan_key: string;
  trial_days: number;
  is_enabled: boolean;
  cta_headline: string | null;
  cta_subtext: string | null;
}): TrialOffer {
  return {
    audience: row.audience === "talent" ? "talent" : "workspace",
    planKey: row.plan_key,
    trialDays: row.trial_days,
    isEnabled: row.is_enabled,
    ctaHeadline: row.cta_headline,
    ctaSubtext: row.cta_subtext,
  };
}

/** One offer by (audience, planKey), or null when none configured. */
export async function loadTrialOffer(
  audience: TrialAudience,
  planKey: string,
): Promise<TrialOffer | null> {
  const sb = createServiceRoleClient();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from("plan_trial_offers")
      .select(SELECT)
      .eq("audience", audience)
      .eq("plan_key", planKey)
      .maybeSingle();
    if (error || !data) return null;
    return normalize(data);
  } catch (err) {
    logServerError("plan_trials.loadTrialOffer", err);
    return null;
  }
}

/** All offers for an audience (admin pricing tab / CTA resolution). */
export async function loadTrialOffers(
  audience: TrialAudience,
): Promise<TrialOffer[]> {
  const sb = createServiceRoleClient();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from("plan_trial_offers")
      .select(SELECT)
      .eq("audience", audience);
    if (error || !data) return [];
    return data.map(normalize);
  } catch (err) {
    logServerError("plan_trials.loadTrialOffers", err);
    return [];
  }
}

/**
 * Every offer across both audiences, ordered workspace-first then by plan key.
 * Powers the platform-admin pricing → Trials config tab.
 */
export async function loadAllTrialOffers(): Promise<TrialOffer[]> {
  const sb = createServiceRoleClient();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from("plan_trial_offers")
      .select(SELECT)
      .order("audience", { ascending: true })
      .order("plan_key", { ascending: true });
    if (error || !data) return [];
    return data.map(normalize);
  } catch (err) {
    logServerError("plan_trials.loadAllTrialOffers", err);
    return [];
  }
}
