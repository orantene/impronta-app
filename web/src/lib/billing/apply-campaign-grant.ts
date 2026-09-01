/**
 * apply-campaign-grant.ts — give a redeemer the entitlement half of a campaign.
 *
 * Called once, from the discount-redemption path, when a code carrying a
 * campaign is redeemed for the first time. The money half is already Stripe's
 * business by then; this is the part that decides what the account can DO.
 *
 * Deliberately conservative, because the failure modes are asymmetric: failing
 * to grant is a support ticket, while wrongly granting (or stacking grants on
 * every webhook retry) quietly gives away paid tiers.
 *   - Workspace subjects only. Talent plan grants live in a different table with
 *     different reconcile machinery; adding them blind would be guesswork.
 *   - Never overwrites an existing ACTIVE override. Someone already on a comp
 *     keeps what an admin gave them; a marketing code does not get to overrule
 *     a human decision, in either direction.
 *   - Best-effort throughout. A webhook must never fail because a courtesy
 *     upgrade did not apply.
 */

import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { resolveCampaignGrant, type CampaignRow } from "./campaign-grant";
import { trackPlanChanged } from "@/lib/analytics/conversion-events";

export type CampaignGrantOutcome =
  | { applied: true; planTier: string; expiresAt: string }
  | { applied: false; reason: "no-campaign" | "no-grant" | "already-overridden" | "error" };

/**
 * Look up the campaign a discount belongs to and, if it carries a grant, apply
 * it to the tenant. `now` is injected so the caller controls the clock.
 */
export async function applyCampaignGrantForDiscount(params: {
  stripeCouponId: string;
  tenantId: string;
  now?: Date;
}): Promise<CampaignGrantOutcome> {
  const now = params.now ?? new Date();
  try {
    const sb = createServiceRoleClient();
    if (!sb) return { applied: false, reason: "error" };

    // Which campaign does this coupon belong to?
    const { data: discount } = await sb
      .from("product_discounts")
      .select("campaign")
      .eq("stripe_coupon_id", params.stripeCouponId)
      .maybeSingle();

    const slug = discount?.campaign?.trim();
    if (!slug) return { applied: false, reason: "no-campaign" };

    const { data: campaign } = await sb
      .from("marketing_campaigns")
      .select("slug, status, grant_plan_tier, grant_duration_days, starts_at, ends_at")
      .eq("slug", slug.toUpperCase())
      .maybeSingle();

    const grant = resolveCampaignGrant((campaign as CampaignRow | null) ?? null, now);
    if (!grant) return { applied: false, reason: "no-grant" };

    // An admin's existing decision outranks a marketing code, whichever way it
    // points. Leave it alone and say so.
    const { data: existing } = await sb
      .from("workspace_plan_overrides")
      .select("id")
      .eq("tenant_id", params.tenantId)
      .eq("status", "active")
      .maybeSingle();
    if (existing) return { applied: false, reason: "already-overridden" };

    // Snapshot what they are on now, so expiry has something to revert to.
    const { data: agency } = await sb
      .from("agencies")
      .select("plan_tier, talent_seat_limit")
      .eq("id", params.tenantId)
      .maybeSingle();
    if (!agency) return { applied: false, reason: "error" };

    const { error: insertError } = await sb.from("workspace_plan_overrides").insert({
      tenant_id: params.tenantId,
      status: "active",
      base_plan_tier: agency.plan_tier,
      base_talent_seat_limit: agency.talent_seat_limit,
      override_plan_tier: grant.planTier,
      grant_kind: "promo",
      starts_at: now.toISOString(),
      expires_at: grant.expiresAt,
      reason: `Campaign ${slug.toUpperCase()}`,
      note: "Granted automatically when the campaign code was redeemed.",
    });
    if (insertError) {
      logServerError("campaign-grant.insert", insertError);
      return { applied: false, reason: "error" };
    }

    // Mirror onto the entity row, the same way the admin action does — this is
    // the column every entitlement check actually reads.
    const { error: mirrorError } = await sb
      .from("agencies")
      .update({ plan_tier: grant.planTier })
      .eq("id", params.tenantId);
    if (mirrorError) logServerError("campaign-grant.mirror", mirrorError);

    // A grant IS an upgrade for funnel purposes: the workspace moved onto a
    // paid tier. `source: "campaign_grant"` keeps it separable from a
    // self-serve purchase so neither number quietly flatters the other.
    void trackPlanChanged({
      direction: "up",
      tenantId: params.tenantId,
      toPlan: grant.planTier,
      source: "campaign_grant",
    });

    return { applied: true, planTier: grant.planTier, expiresAt: grant.expiresAt };
  } catch (err) {
    logServerError("campaign-grant.apply", err);
    return { applied: false, reason: "error" };
  }
}
