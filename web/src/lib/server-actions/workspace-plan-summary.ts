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
import { loadWorkspaceOverrideBanner } from "@/app/(workspace)/platform/workspace-override-banner-data";
import { loadTierRenewLabels } from "@/lib/admin/plan-tiers-live";
import { resolveTier } from "@/lib/admin/plan-tiers";

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
};

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
    const [summary, billingState, override, canManageBilling] = await Promise.all([
      loadWorkspaceAgencySummary(tenantId),
      loadWorkspaceBillingState(tenantId),
      loadWorkspaceOverrideBanner(tenantId),
      userHasCapability("manage_billing", tenantId),
    ]);

    if (!summary) {
      return { ok: false, error: "Could not load this workspace's plan." };
    }

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
        override: override
          ? {
              overridePlanTier: override.overridePlanTier,
              basePlanTier: override.basePlanTier,
              expiresAt: override.expiresAt,
              startedAt: override.startedAt,
              reason: override.reason,
            }
          : null,
      },
    };
  } catch (err) {
    logServerError("workspace-plan-summary.load", err);
    return { ok: false, error: "Could not load this workspace's plan." };
  }
}
