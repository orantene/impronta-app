import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import { loadWorkspaceSubscriptionState, type WorkspaceSubscriptionState } from "@/lib/stripe/workspace-billing";
import { loadTalentSubscriptionState, type TalentSubscriptionState } from "@/lib/stripe/talent-billing";

/**
 * _data-bridge/billing.ts — Stripe billing + payout account loaders.
 *
 * Split out of `_data-bridge.ts` (rev 13). Three concerns colocated:
 *   1. Workspace (agency) Stripe subscription state
 *   2. Payout account snapshots (workspace + per-talent)
 *   3. Talent personal subscription state
 *
 * Re-exports `WorkspaceSubscriptionState` / `TalentSubscriptionState` from
 * the underlying Stripe library modules so importers don't need to know
 * about the deeper paths.
 */

// ─── Workspace billing ───────────────────────────────────────────────────────

export type { WorkspaceSubscriptionState };

/**
 * Load the current Stripe subscription state for a tenant.
 * Returns null when the tenant has no active subscription (free tier or
 * legacy plan). Uses the SSR client so RLS is applied (staff read only).
 */
export async function loadWorkspaceBillingState(
  tenantId: string,
): Promise<WorkspaceSubscriptionState | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;
    return loadWorkspaceSubscriptionState(tenantId, supabase);
  } catch (err) {
    logServerError("workspace.loadBillingState", err);
    return null;
  }
}

// ─── Payout accounts (Phase 8.4) ────────────────────────────────────────────

export type PayoutAccountSummary = {
  id: string;
  ownerType: "agency" | "profile" | "talent";
  ownerId: string;
  displayName: string;
  provider: string;
  status: "pending_verification" | "connected" | "restricted" | "disconnected" | "failed";
  connectedAt: string | null;
  lastVerifiedAt: string | null;
};

export type WorkspacePayoutSnapshot = {
  workspaceAccount: PayoutAccountSummary | null;
  selfStaffAccount: PayoutAccountSummary | null;
  connectedCount: number;
};

/**
 * Returns workspace payout account + current staff profile payout account.
 * Safe fallback when payout tables are not yet applied: returns null accounts.
 */
export async function loadWorkspacePayoutSnapshot(
  tenantId: string,
  profileId: string,
): Promise<WorkspacePayoutSnapshot> {
  const empty: WorkspacePayoutSnapshot = {
    workspaceAccount: null,
    selfStaffAccount: null,
    connectedCount: 0,
  };

  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return empty;

    const { data, error } = await supabase
      .from("payout_accounts")
      .select("id, owner_type, owner_id, display_name, provider, status, connected_at, last_verified_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (error) {
      logServerError("workspace.loadPayoutSnapshot", error);
      return empty;
    }

    const rows = (data ?? []) as {
      id: string;
      owner_type: "agency" | "profile" | "talent";
      owner_id: string;
      display_name: string;
      provider: string;
      status: "pending_verification" | "connected" | "restricted" | "disconnected" | "failed";
      connected_at: string | null;
      last_verified_at: string | null;
    }[];

    const toSummary = (row: (typeof rows)[number]): PayoutAccountSummary => ({
      id: row.id,
      ownerType: row.owner_type,
      ownerId: row.owner_id,
      displayName: row.display_name,
      provider: row.provider,
      status: row.status,
      connectedAt: row.connected_at,
      lastVerifiedAt: row.last_verified_at,
    });

    const workspaceAccountRaw = rows.find(
      (row) => row.owner_type === "agency" && row.owner_id === tenantId,
    );
    const selfStaffAccountRaw = rows.find(
      (row) => row.owner_type === "profile" && row.owner_id === profileId,
    );

    return {
      workspaceAccount: workspaceAccountRaw ? toSummary(workspaceAccountRaw) : null,
      selfStaffAccount: selfStaffAccountRaw ? toSummary(selfStaffAccountRaw) : null,
      connectedCount: rows.filter((row) => row.status === "connected").length,
    };
  } catch (err) {
    logServerError("workspace.loadPayoutSnapshot", err);
    return empty;
  }
}

/**
 * Talent-owned payout account in one workspace.
 * Returns null when no account exists or payout tables are not applied yet.
 */
export async function loadTalentPayoutAccountForTenant(
  tenantId: string,
  talentProfileId: string,
): Promise<PayoutAccountSummary | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from("payout_accounts")
      .select("id, owner_type, owner_id, display_name, provider, status, connected_at, last_verified_at")
      .eq("tenant_id", tenantId)
      .eq("owner_type", "talent")
      .eq("owner_id", talentProfileId)
      .order("created_at", { ascending: false })
      .maybeSingle();

    if (error || !data) {
      if (error) logServerError("workspace.loadTalentPayoutAccount", error);
      return null;
    }

    const row = data as {
      id: string;
      owner_type: "agency" | "profile" | "talent";
      owner_id: string;
      display_name: string;
      provider: string;
      status: "pending_verification" | "connected" | "restricted" | "disconnected" | "failed";
      connected_at: string | null;
      last_verified_at: string | null;
    };

    return {
      id: row.id,
      ownerType: row.owner_type,
      ownerId: row.owner_id,
      displayName: row.display_name,
      provider: row.provider,
      status: row.status,
      connectedAt: row.connected_at,
      lastVerifiedAt: row.last_verified_at,
    };
  } catch (err) {
    logServerError("workspace.loadTalentPayoutAccount", err);
    return null;
  }
}

// ─── Talent personal billing ─────────────────────────────────────────────────

export type { TalentSubscriptionState };

/**
 * Load the Stripe subscription state for a talent profile.
 * Returns null when the talent is on Basic (free — no subscription row).
 * Also reads talent_plan_key directly from talent_profiles for the current tier.
 */
export async function loadTalentBillingState(
  talentProfileId: string,
): Promise<{ planKey: string; subscription: TalentSubscriptionState | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { planKey: "talent_basic", subscription: null };

    const [profileRes, subscriptionState] = await Promise.all([
      supabase
        .from("talent_profiles")
        .select("talent_plan_key")
        .eq("id", talentProfileId)
        .maybeSingle(),
      loadTalentSubscriptionState(talentProfileId, supabase),
    ]);

    const planKey =
      (profileRes.data as { talent_plan_key: string } | null)?.talent_plan_key
        ?? "talent_basic";

    return { planKey, subscription: subscriptionState };
  } catch (err) {
    logServerError("workspace.loadTalentBillingState", err);
    return { planKey: "talent_basic", subscription: null };
  }
}
