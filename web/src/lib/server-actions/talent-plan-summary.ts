"use server";

// ============================================================================
// talent-plan-summary.ts — read-only plan summary for the talent surface
//
// The talent-side analog of `workspace-plan-summary.ts`. Powers the talent
// plan badge / trial block: the talent's effective plan (Free / Pro / Max), any
// platform-granted override (comp / trial), the derived trial presentation
// state (live countdown · expiring urgency · post-expiry "bring it back" nudge),
// and the engagement CTA the platform configured for the next tier up.
//
// "One engine, two audiences": this composes the SAME pure trial engine
// (`deriveTrialView`) the workspace badge uses, fed by the talent grant loader.
// `loadTalentPlanGrants` reconciles expiry first, so the effective plan + the
// trial view are always current before we present them.
//
// Auth: self-scoped via `requireTalentSelf()` — a talent only ever sees their
// own plan. No id is passed from the client; the signed-in user resolves it.
// ============================================================================

import { requireTalentSelf } from "@/lib/server/talent-self-guard";
import { logServerError } from "@/lib/server/safe-error";
import {
  loadTalentPlanGrants,
  talentGrantToInput,
} from "@/lib/plan-trials/talent-grants";
import { loadTrialOffers } from "@/lib/plan-trials/offers";
import { loadTalentSubscriptionState } from "@/lib/stripe/talent-billing";
import {
  deriveTrialView,
  type GrantKind,
  type TrialPhase,
} from "@/lib/plan-trials";
import { getPlan, getUpgradePathFromPlan, isKnownPlan } from "@/lib/access/plan-catalog";

export type TalentPlanSummary = {
  /** talent_profiles.talent_plan_key — talent_basic | talent_pro | talent_portfolio. */
  planKey: string;
  /** Display label — Free / Pro / Max. */
  planLabel: string;
  /** Short catalog tagline for the effective plan. */
  tagline: string;
  /** Honest monthly price copy ("Free" / "$12 / month"). */
  priceLabel: string;
  /** Live talent Stripe subscription, or null on Free / no record. */
  subscription: {
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    trialEnd: string | null;
  } | null;
  /** Platform-granted plan override (comp / trial), or null. */
  override: {
    overridePlanKey: string;
    overridePlanLabel: string;
    basePlanKey: string;
    basePlanLabel: string;
    expiresAt: string | null;
    startedAt: string;
    reason: string | null;
  } | null;
  /**
   * Derived trial presentation state (countdown / expiring / post-expiry
   * nudge). Null when there is nothing trial-related to surface.
   */
  trial: {
    phase: TrialPhase;
    grantKind: GrantKind | null;
    grantedPlanKey: string;
    grantedPlanLabel: string;
    basePlanKey: string;
    basePlanLabel: string;
    daysLeft: number;
    daysSinceExpiry: number;
    pct: number;
  } | null;
  /**
   * The plan to advertise in the in-popover engagement CTA — either the trialed
   * tier (keep/restore) or the next tier up. Null when already at the top.
   */
  upgradeOffer: {
    planKey: string;
    planLabel: string;
    trialDays: number;
    isTrialEnabled: boolean;
    ctaHeadline: string | null;
    ctaSubtext: string | null;
  } | null;
};

export type TalentPlanSummaryResult =
  | { ok: true; summary: TalentPlanSummary }
  | { ok: false; error: string };

/** Display label for a (possibly unknown) plan key. */
function planLabelOf(planKey: string): string {
  return isKnownPlan(planKey) ? getPlan(planKey).displayName : planKey;
}

/** Honest monthly price copy from the catalog (USD placeholder pricing). */
function planPriceLabel(planKey: string): string {
  if (!isKnownPlan(planKey)) return "";
  const def = getPlan(planKey);
  if (!def.monthlyPriceCents) return "Free";
  const amount = (def.monthlyPriceCents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: def.currency || "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return `${amount} / month`;
}

export async function loadTalentPlanSummary(): Promise<TalentPlanSummaryResult> {
  // ── Auth — self-scoped ─────────────────────────────────────────────────────
  const scope = await requireTalentSelf();
  if (!scope.ok) {
    return { ok: false, error: scope.error };
  }
  const { talentProfile, planKey, session } = scope;

  try {
    // loadTalentPlanGrants reconciles expiry first, so planKey + trial view are
    // current. Subscription read uses the talent's own RLS context.
    const [grants, offers, subscription] = await Promise.all([
      loadTalentPlanGrants(talentProfile.id),
      loadTrialOffers("talent"),
      loadTalentSubscriptionState(talentProfile.id, session.supabase),
    ]);

    // ── Derive the trial view ────────────────────────────────────────────────
    // Prefer the active grant; fall back to a just-ended trial so the
    // post-expiry upgrade nudge can still show.
    const grantForTrial = grants.active ?? grants.endedTrial;
    const trialView = deriveTrialView(talentGrantToInput(grantForTrial));

    // Pick the plan to advertise: keep/restore the trialed tier, else promote
    // from the effective plan to the next tier up.
    const upgradePath = isKnownPlan(planKey) ? getUpgradePathFromPlan(planKey) : [];
    const targetKey =
      trialView.phase !== "none" && isKnownPlan(trialView.grantedPlan)
        ? trialView.grantedPlan
        : (upgradePath[0]?.key ?? null);
    const offer = targetKey
      ? offers.find((o) => o.planKey === targetKey) ?? null
      : null;

    return {
      ok: true,
      summary: {
        planKey,
        planLabel: planLabelOf(planKey),
        tagline: (isKnownPlan(planKey) ? getPlan(planKey).tagline : "") ?? "",
        priceLabel: planPriceLabel(planKey),
        subscription: subscription
          ? {
              status: subscription.status,
              currentPeriodEnd: subscription.currentPeriodEnd,
              cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
              trialEnd: subscription.trialEnd,
            }
          : null,
        override: grants.active
          ? {
              overridePlanKey: grants.active.overridePlanKey,
              overridePlanLabel: planLabelOf(grants.active.overridePlanKey),
              basePlanKey: grants.active.basePlanKey,
              basePlanLabel: planLabelOf(grants.active.basePlanKey),
              expiresAt: grants.active.expiresAt,
              startedAt: grants.active.startsAt,
              reason: grants.active.reason,
            }
          : null,
        trial:
          trialView.phase === "none"
            ? null
            : {
                phase: trialView.phase,
                grantKind: trialView.grantKind,
                grantedPlanKey: trialView.grantedPlan,
                grantedPlanLabel: planLabelOf(trialView.grantedPlan),
                basePlanKey: trialView.basePlan,
                basePlanLabel: planLabelOf(trialView.basePlan),
                daysLeft: trialView.daysLeft,
                daysSinceExpiry: trialView.daysSinceExpiry,
                pct: trialView.pct,
              },
        upgradeOffer: offer
          ? {
              planKey: offer.planKey,
              planLabel: planLabelOf(offer.planKey),
              trialDays: offer.trialDays,
              isTrialEnabled: offer.isEnabled,
              ctaHeadline: offer.ctaHeadline,
              ctaSubtext: offer.ctaSubtext,
            }
          : null,
      },
    };
  } catch (err) {
    logServerError("talent-plan-summary.load", err);
    return { ok: false, error: "Could not load your plan." };
  }
}
