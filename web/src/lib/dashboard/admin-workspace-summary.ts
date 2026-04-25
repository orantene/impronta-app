import { cache } from "react";

import { requireStaff } from "@/lib/server/action-guards";
import { logServerError } from "@/lib/server/safe-error";
import { getTenantScope } from "@/lib/saas/scope";
import { listAdminRosterTalentIds } from "@/lib/saas/talent-roster";

/**
 * Single source of truth for workspace billing/identity inside the admin
 * shell. The tier-chip in the top bar, the AccountBillingPanels card, and
 * the upgrade modal all read this — never the `?plan=` URL param — so the
 * dashboard reflects what the tenant actually pays for.
 *
 * `talent_seat_limit = NULL` means "unlimited" (Network plan).
 */
export type WorkspacePlan = "free" | "studio" | "agency" | "network";

export type AdminWorkspaceSummary = {
  tenantId: string;
  /** Public agency slug — useful for "your subdomain" copy. */
  slug: string;
  /** Display name shown in switcher + billing panels. */
  displayName: string;
  /** Subscription tier from `agencies.plan_tier`. */
  plan: WorkspacePlan;
  /** Roster cap from `agencies.talent_seat_limit`. NULL = unlimited. */
  talentLimit: number | null;
  /** Current talent count on the tenant's roster (status != removed). */
  talentCount: number;
  /** Lifecycle status from `agencies.status`. */
  status: string;
};

const VALID_PLANS = new Set(["free", "studio", "agency", "network"] as const);

/** Coerce an unknown plan_tier string into a WorkspacePlan, falling back to free. */
function coercePlan(raw: unknown): WorkspacePlan {
  if (typeof raw === "string" && VALID_PLANS.has(raw as WorkspacePlan)) {
    return raw as WorkspacePlan;
  }
  return "free";
}

/**
 * Loads the workspace summary for the current actor's active tenant.
 * Returns null when there's no resolvable scope (anon, locked-out staff,
 * etc.); callers should treat that as "no workspace yet".
 */
export const loadAdminWorkspaceSummary = cache(
  async (): Promise<AdminWorkspaceSummary | null> => {
    const auth = await requireStaff();
    if (!auth.ok) return null;

    const { supabase } = auth;
    const scope = await getTenantScope();
    if (!scope) return null;

    const tenantId = scope.tenantId;

    const [agencyRes, rosterTalentIds] = await Promise.all([
      supabase
        .from("agencies")
        .select(
          "id, slug, display_name, status, plan_tier, talent_seat_limit",
        )
        .eq("id", tenantId)
        .maybeSingle(),
      listAdminRosterTalentIds(supabase, tenantId),
    ]);

    if (agencyRes.error || !agencyRes.data) {
      if (agencyRes.error) {
        logServerError("admin/loadAdminWorkspaceSummary", agencyRes.error);
      }
      return null;
    }

    const row = agencyRes.data as {
      id: string;
      slug: string;
      display_name: string;
      status: string;
      plan_tier: string | null;
      talent_seat_limit: number | null;
    };

    return {
      tenantId: row.id,
      slug: row.slug,
      displayName: row.display_name,
      plan: coercePlan(row.plan_tier),
      talentLimit: row.talent_seat_limit,
      talentCount: rosterTalentIds.length,
      status: row.status,
    };
  },
);
