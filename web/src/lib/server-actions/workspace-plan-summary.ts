"use server";

// ============================================================================
// workspace-plan-summary.ts — read-only plan summary for the top-bar plan badge
//
// Powers <WorkspacePlanBadge>'s popover. Composes the existing billing loaders
// so there is ONE honest source for: plan tier + label, registration date,
// seat usage, live renewal/price copy, the live Stripe subscription state, and
// any platform-granted plan override (comp / trial). Every field degrades to
// null rather than fabricating — the popover renders graceful fallbacks.
//
// Auth: membership-gated via getTenantScopeBySlug, then `agency.workspace.view`
// (viewer+) — the same gate the canonical /admin/account billing page uses.
// `manage_billing` is reported separately so the popover can show the right
// CTA (Manage vs view-only).
// ============================================================================

import { getCachedActorSession } from "@/lib/server/request-cache";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { logServerError } from "@/lib/server/safe-error";
import { loadWorkspaceAgencySummary } from "@/app/(workspace)/[tenantSlug]/_data-bridge/workspace-config";
import { loadWorkspaceBillingState } from "@/app/(workspace)/[tenantSlug]/_data-bridge/billing";
import { loadWorkspacePlanGrants } from "@/app/(workspace)/platform/workspace-override-banner-data";
import { loadTierRenewLabels } from "@/lib/admin/plan-tiers-live";
import { resolveTier } from "@/lib/admin/plan-tiers";
import {
  deriveTrialView,
  type GrantKind,
  type PlanGrantInput,
  type TrialPhase,
} from "@/lib/plan-trials";
import { loadTrialOffers } from "@/lib/plan-trials/offers";
import {
  isWorkspacePlanTier,
  PLAN_TIER_LABEL,
  PLAN_TIER_RANK,
  WORKSPACE_PLAN_TIERS,
  type WorkspacePlanTier,
} from "@/lib/platform/plan-override";

export type WorkspacePlanSummary = {
  planTier: string;
  planLabel: string;
  /** Live, currency-localized price/renew copy for the effective plan. */
  renewLabel: string;
  /** agencies.created_at — workspace registration date (ISO). Null if unreadable. */
  registeredAt: string | null;
  /** Roster seats consumed (active roster rows). */
  seatUsed: number | null;
  /** Seat cap for the plan; null = unlimited. */
  seatLimit: number | null;
  /** Lowercase ISO 4217, or null (Adaptive Pricing auto-detect). */
  preferredCurrency: string | null;
  /** True when the caller can change billing (owner / billing manager). */
  canManageBilling: boolean;
  /** Live Stripe subscription, or null on the Free tier / no record. */
  subscription: {
    status: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    trialEnd: string | null;
  } | null;
  /** Platform-granted plan override (comp / trial), or null. */
  override: {
    overridePlanTier: string;
    basePlanTier: string;
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
    grantedPlanTier: string;
    grantedPlanLabel: string;
    basePlanTier: string;
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

/** The next workspace tier above `tier`, or null at the top / unknown. */
function nextWorkspaceTierUp(tier: string): WorkspacePlanTier | null {
  const rank = PLAN_TIER_RANK[tier as WorkspacePlanTier];
  if (rank === undefined) return null;
  return WORKSPACE_PLAN_TIERS.find((t) => PLAN_TIER_RANK[t] === rank + 1) ?? null;
}

export type WorkspacePlanSummaryResult =
  | { ok: true; summary: WorkspacePlanSummary }
  | { ok: false; error: string };

export async function loadWorkspacePlanSummary(params: {
  tenantSlug: string;
}): Promise<WorkspacePlanSummaryResult> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await getCachedActorSession();
  if (!session.supabase || !session.user) {
    return { ok: false, error: "You must be signed in." };
  }

  // ── Resolve tenant (membership-gated) ─────────────────────────────────────
  const scope = await getTenantScopeBySlug(params.tenantSlug);
  if (!scope) {
    return { ok: false, error: "Workspace not found." };
  }
  const tenantId = scope.tenantId;

  // ── View gate — viewer+ may see the plan summary ──────────────────────────
  const canView = await userHasCapability("agency.workspace.view", tenantId);
  if (!canView) {
    return { ok: false, error: "You don't have access to this workspace's plan." };
  }

  try {
    const [summary, billingState, grants, canManageBilling, offers] =
      await Promise.all([
        loadWorkspaceAgencySummary(tenantId),
        loadWorkspaceBillingState(tenantId),
        loadWorkspacePlanGrants(tenantId),
        userHasCapability("manage_billing", tenantId),
        loadTrialOffers("workspace"),
      ]);

    if (!summary) {
      return { ok: false, error: "Could not load this workspace's plan." };
    }

    // ── Derive the trial view ────────────────────────────────────────────────
    // Prefer the active grant; fall back to a just-ended trial so the
    // post-expiry upgrade nudge can still show.
    const grantForTrial = grants.active ?? grants.endedTrial;
    const grantInput: PlanGrantInput | null = grantForTrial
      ? {
          status: grantForTrial.status,
          grantKind: grantForTrial.grantKind,
          grantedPlan: grantForTrial.overridePlanTier,
          basePlan: grantForTrial.basePlanTier,
          startsAt: grantForTrial.startsAt,
          expiresAt: grantForTrial.expiresAt,
          endedAt: grantForTrial.endedAt,
        }
      : null;
    const trialView = deriveTrialView(grantInput);

    // Pick the plan to advertise: keep/restore the trialed tier, else promote
    // from the effective plan to the next tier up.
    const targetTier: WorkspacePlanTier | null =
      trialView.phase !== "none" && isWorkspacePlanTier(trialView.grantedPlan)
        ? trialView.grantedPlan
        : nextWorkspaceTierUp(summary.plan);
    const offer = targetTier
      ? offers.find((o) => o.planKey === targetTier) ?? null
      : null;

    // Live, currency-localized renewal line (falls back to the static catalog
    // copy if the price read fails — never an empty line).
    const currency = (summary.preferredCurrency ?? "USD").toUpperCase();
    let renewLabel: string;
    try {
      const liveRenew = await loadTierRenewLabels(currency);
      renewLabel = resolveTier(summary.plan, liveRenew).renew;
    } catch (err) {
      logServerError("workspace-plan-summary.renewLabels", err);
      renewLabel = resolveTier(summary.plan).renew;
    }

    return {
      ok: true,
      summary: {
        planTier: summary.plan,
        planLabel: resolveTier(summary.plan).label,
        renewLabel,
        registeredAt: summary.registeredAt,
        seatUsed: summary.talentCount,
        seatLimit: summary.talentLimit,
        preferredCurrency: summary.preferredCurrency,
        canManageBilling,
        subscription: billingState
          ? {
              status: billingState.status,
              currentPeriodStart: billingState.currentPeriodStart,
              currentPeriodEnd: billingState.currentPeriodEnd,
              cancelAtPeriodEnd: billingState.cancelAtPeriodEnd,
              trialEnd: billingState.trialEnd,
            }
          : null,
        override: grants.active
          ? {
              overridePlanTier: grants.active.overridePlanTier,
              basePlanTier: grants.active.basePlanTier,
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
                grantedPlanTier: trialView.grantedPlan,
                grantedPlanLabel:
                  PLAN_TIER_LABEL[trialView.grantedPlan as WorkspacePlanTier] ??
                  trialView.grantedPlan,
                basePlanTier: trialView.basePlan,
                daysLeft: trialView.daysLeft,
                daysSinceExpiry: trialView.daysSinceExpiry,
                pct: trialView.pct,
              },
        upgradeOffer: offer
          ? {
              planKey: offer.planKey,
              planLabel:
                PLAN_TIER_LABEL[offer.planKey as WorkspacePlanTier] ??
                offer.planKey,
              trialDays: offer.trialDays,
              isTrialEnabled: offer.isEnabled,
              ctaHeadline: offer.ctaHeadline,
              ctaSubtext: offer.ctaSubtext,
            }
          : null,
      },
    };
  } catch (err) {
    logServerError("workspace-plan-summary.load", err);
    return { ok: false, error: "Could not load this workspace's plan." };
  }
}
