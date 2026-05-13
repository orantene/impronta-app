import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  loadClientTrustStatesForTenant,
  loadClientTrustState,
  type ClientTrustState,
} from "@/lib/client-trust/evaluator";
import { loadFieldCatalog } from "@/lib/profile-fields-service";
import { loadWorkspaceSubscriptionState, type WorkspaceSubscriptionState } from "@/lib/stripe/workspace-billing";
import { loadTalentSubscriptionState, type TalentSubscriptionState } from "@/lib/stripe/talent-billing";
import { getFeeBasisPoints, feePercent } from "@/lib/bookings/commission";
import { loadTransactionsForTenant } from "@/lib/bookings/transactions";

// Type-only import — `_state.tsx` is "use client"; import type is erased.
import type { TalentProfile } from "@/components/admin/shell/internal/state";

// Site-admin helpers used by loadWebsiteData.
import { listPagesForStaff } from "@/lib/site-admin/server/pages-reads";
import { loadIdentityForStaff } from "@/lib/site-admin/server/reads";

/**
 * _data-bridge.ts — Phase 3 workspace server-side data bridge.
 *
 * Provides tenant-id-explicit data loaders for the canonical workspace
 * routes at `(workspace)/[tenantSlug]/*`. Unlike the existing dashboard
 * loaders (which call `getTenantScope()` internally), these functions
 * accept an explicit `tenantId` so they work correctly on the app host
 * where tenant resolution comes from the URL slug, not the host header
 * or active-tenant cookie.
 *
 * Every function here is server-only, uses the SSR client (user RLS), and
 * never falls back to mock data. Empty/null returns are safe states — the
 * route renders gracefully without them.
 */

// ─── Overview metrics ────────────────────────────────────────────────────────
// Moved to ./_data-bridge/overview-metrics.ts (rev 13 split).
export {
  type WorkspaceOverviewMetrics,
  loadWorkspaceOverviewMetrics,
  loadPendingRosterCount,
} from "./_data-bridge/overview-metrics";

// ─── Roster — moved to ./_data-bridge/roster.ts (rev 13)
export {
  type WorkspaceRosterItem,
  loadWorkspaceRosterForTenant,
  loadWorkspaceRosterEnriched,
} from "./_data-bridge/roster";


// ─── Inquiries-workspace — moved to ./_data-bridge/inquiries-workspace.ts (rev 13)
export {
  INQUIRY_CLOSED_STATUSES,
  type WorkspaceInquiryRow,
  loadWorkspaceInquiries,
} from "./_data-bridge/inquiries-workspace";


// ─── Clients — moved to ./_data-bridge/clients.ts (rev 13)
export {
  type WorkspaceClientRow,
  loadWorkspaceClients,
  type ClientSelfProfile,
  loadClientSelfProfile,
  type ClientInquiryRow,
  loadClientInquiries,
} from "./_data-bridge/clients";


// ─── Bookings — moved to ./_data-bridge/bookings.ts (rev 13)
export {
  type WorkspaceBookingRow,
  loadWorkspaceBookings,
  type ClientBookingRow,
  loadClientBookings,
} from "./_data-bridge/bookings";

// ─── Pitches — Phase 9, ./_data-bridge/pitches.ts (rev 14)
export {
  type WorkspacePitchRow,
  loadWorkspacePitches,
} from "./_data-bridge/pitches";

// ─── Agency / Domain / Plan — moved to ./_data-bridge/workspace-config.ts (rev 13)
export {
  type WorkspacePlan,
  type WorkspaceAgencySummary,
  loadWorkspaceAgencySummary,
  type WorkspaceDomainSummary,
  loadWorkspaceDomainSummary,
} from "./_data-bridge/workspace-config";

// ─── Billing + payouts — moved to ./_data-bridge/billing.ts (rev 13)
export {
  type WorkspaceSubscriptionState,
  loadWorkspaceBillingState,
  type PayoutAccountSummary,
  type WorkspacePayoutSnapshot,
  loadWorkspacePayoutSnapshot,
  loadTalentPayoutAccountForTenant,
  type TalentSubscriptionState,
  loadTalentBillingState,
} from "./_data-bridge/billing";

// ─── Team members — moved to ./_data-bridge/workspace-config.ts (rev 13)
export {
  type WorkspaceTeamMember,
  loadWorkspaceTeamMembers,
} from "./_data-bridge/workspace-config";

// ─── Messages — moved to ./_data-bridge/inquiries-messages.ts (rev 13)
export {
  type ThreadType,
  type WorkspaceMessage,
  type WorkspaceInquiryForMessages,
  loadInquiriesForMessages,
  loadTotalUnreadMessages,
  loadInquiryMessages,
} from "./_data-bridge/inquiries-messages";


// ─── Calendar events ──────────────────────────────────────────────────────────
// Moved to ./_data-bridge/calendar.ts (rev 13 split). Re-exported below.
export { type CalendarEvent, loadCalendarEvents } from "./_data-bridge/calendar";

// ─── Notifications — B.2 (user_notifications backend)
export {
  type UserNotification,
  loadUserNotifications,
} from "./_data-bridge/notifications";

// ─── Website data — moved to ./_data-bridge/website.ts (rev 13)
export {
  type WebsitePageItem,
  type WebsitePostItem,
  type WebsiteRedirectItem,
  type WebsiteData,
  loadWebsiteData,
} from "./_data-bridge/website";

// ─── Activity feeds — moved to ./_data-bridge/activity.ts (rev 13)
export {
  type RecentActivityItem,
  loadRecentActivity,
  type InquiryActivityItem,
  loadInquiryActivity,
} from "./_data-bridge/activity";

// ─── Talent loaders — moved to ./_data-bridge/talent.ts (rev 13)
export {
  type TalentSelfProfile,
  loadTalentSelfProfile,
  type TalentInquiryRow,
  loadTalentInquiries,
  type TalentAgencyRow,
  loadTalentAgencies,
  type TalentContactPrefs,
  loadTalentContactPrefs,
} from "./_data-bridge/talent";





// ─── F2 — Workspace field catalog (profile_field_definitions) ─────────────────

export type WorkspaceFieldEntry = {
  fieldKey: string;
  label: string;
  tier: "universal" | "global" | "type-specific";
  section: string;
  kind: string;
  enabled: boolean;
  adminOnly: boolean;
  showInPublic: boolean;
  talentEditable: boolean;
};

export type WorkspaceFieldGroup = {
  tier: "universal" | "global" | "type-specific";
  fields: WorkspaceFieldEntry[];
};

/**
 * Load the field catalog for workspace settings display (F2 cutover).
 * Reads profile_field_definitions via loadFieldCatalog() with workspace
 * overrides from workspace_profile_field_settings.
 *
 * Groups fields by tier for the settings "Fields" tab.
 * Returns empty groups on error — never throws.
 */
export async function loadWorkspaceFieldCatalog(
  tenantId: string,
): Promise<WorkspaceFieldGroup[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const resolved = await loadFieldCatalog(supabase, { tenantId });

    const byTier = new Map<"universal" | "global" | "type-specific", WorkspaceFieldEntry[]>();
    const tiers: ("universal" | "global" | "type-specific")[] = ["universal", "global", "type-specific"];
    for (const tier of tiers) byTier.set(tier, []);

    for (const f of resolved) {
      const tier = f.tier as "universal" | "global" | "type-specific";
      const list = byTier.get(tier) ?? [];
      list.push({
        fieldKey: f.fieldKey,
        label: f.label,
        tier,
        section: f.section,
        kind: f.kind,
        enabled: f.enabled,
        adminOnly: f.adminOnly,
        showInPublic: f.showInPublic,
        talentEditable: f.talentEditable,
      });
      byTier.set(tier, list);
    }

    return tiers
      .map((tier) => ({ tier, fields: byTier.get(tier) ?? [] }))
      .filter((g) => g.fields.length > 0);
  } catch (err) {
    logServerError("workspace.loadFieldCatalog", err);
    return [];
  }
}

// ─── Commission context (Phase 8.4) ──────────────────────────────────────────

export type CommissionContext = {
  planTier: string;
  feeBasisPoints: number;
  feePercent: string;
};

/**
 * Returns the workspace plan tier and the corresponding platform fee basis points.
 * Used by the bookings page to display the fee rate and by transaction creation.
 */
export async function loadCommissionContext(tenantId: string): Promise<CommissionContext> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { planTier: "free", feeBasisPoints: 0, feePercent: "0%" };

    const { data } = await supabase
      .from("agencies")
      .select("plan_tier")
      .eq("id", tenantId)
      .maybeSingle();

    const planTier = (data as { plan_tier?: string } | null)?.plan_tier ?? "free";
    const bps = getFeeBasisPoints(planTier);
    return { planTier, feeBasisPoints: bps, feePercent: feePercent(bps) };
  } catch (err) {
    logServerError("workspace.loadCommissionContext", err);
    return { planTier: "free", feeBasisPoints: 0, feePercent: "0%" };
  }
}

// ─── Client trust state (Phase 8.3) ──────────────────────────────────────────

export type { ClientTrustState };

/**
 * Load the trust state for a client user in a given tenant.
 * Returns a default Basic state when no row exists yet.
 */
export async function loadClientTrustBillingState(
  userId: string,
  tenantId: string,
): Promise<ClientTrustState> {
  const state = await loadClientTrustState(userId, tenantId);
  return state ?? {
    userId,
    tenantId,
    trustLevel: "basic",
    verifiedAt: null,
    fundedBalanceCents: 0,
    manualOverride: null,
    evaluatedAt: new Date().toISOString(),
  };
}
