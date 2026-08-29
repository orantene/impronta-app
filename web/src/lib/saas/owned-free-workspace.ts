import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { isRetiredWorkspaceStatus } from "./workspace-lifecycle";

/**
 * "One Free workspace per owner" — the anti-abuse rule.
 *
 * Binding statement: `web/docs/admin-prototype/messaging-shells-handoff.md`
 * §1.4 — "a user can only OWN one Free workspace. Creating a second Free
 * requires upgrading the existing one to a paid tier." Already surfaced in the
 * product by the workspace-switcher create footer (`components/admin/shell/
 * internal/wave2.tsx`), which disables the "+ Free" chip and shows an amber
 * explainer when the viewer already owns one.
 *
 * This module is the single reader both the /get-started funnel and the
 * `/onboarding/workspace` provisioner use, so the marketing form, the server
 * action, and the provisioner can never disagree about whether a second Free
 * workspace is allowed.
 */

export type OwnedFreeWorkspace = {
  tenantId: string;
  slug: string;
  displayName: string;
  /** `settings.signup_tier_interest` stamped at creation, normalized. */
  signupTierInterest: "free" | "studio" | "agency" | "network" | null;
  /** `settings.signup_lead_id` stamped at creation (null for legacy rows). */
  signupLeadId: string | null;
};

type AgencyJoinRow = {
  slug: string | null;
  display_name: string | null;
  plan_tier: string | null;
  status: string | null;
  settings: Record<string, unknown> | null;
};

type MembershipRow = {
  tenant_id: string;
  agencies: AgencyJoinRow | AgencyJoinRow[] | null;
};

export function normalizeWorkspaceTierInterest(
  value: unknown,
): "free" | "studio" | "agency" | "network" | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (v === "free" || v === "studio" || v === "agency" || v === "network") return v;
  return null;
}

/**
 * Every LIVE Free-tier workspace this user OWNS (role=owner, status=active).
 *
 * "Live" is load-bearing. The delete in platform admin is a SOFT delete: it
 * only sets `agencies.status = 'cancelled'`. This read used to filter on the
 * MEMBERSHIP row's status and on `plan_tier` alone, never on the AGENCY's
 * status, so a cancelled workspace kept occupying its owner's single Free slot
 * — and `findFreeWorkspaceLimitBlocker` then refused them a new one, forever,
 * with no self-serve way out. Retired agencies are skipped here.
 *
 * Returns an empty array both when the user owns none and when the read
 * fails — callers that need to distinguish should treat a failure as "unknown"
 * and fall back to the permissive path (the provisioner's slug-uniqueness
 * constraint is the backstop).
 */
export async function listOwnedFreeWorkspaces(
  userId: string,
): Promise<OwnedFreeWorkspace[]> {
  const admin = createServiceRoleClient();
  if (!admin) return [];

  const { data, error } = await admin
    .from("agency_memberships")
    .select(
      "tenant_id, agencies:tenant_id ( slug, display_name, plan_tier, status, settings )",
    )
    .eq("profile_id", userId)
    .eq("role", "owner")
    .eq("status", "active");

  if (error) {
    logServerError("owned-free-workspace.list", error);
    return [];
  }

  const out: OwnedFreeWorkspace[] = [];
  for (const row of (data ?? []) as MembershipRow[]) {
    const agency = Array.isArray(row.agencies) ? row.agencies[0] ?? null : row.agencies;
    if (!agency || agency.plan_tier !== "free" || !agency.slug) continue;
    // A cancelled/archived workspace is gone. It must not consume the owner's
    // one Free slot. `suspended` deliberately still counts: it is reversible.
    if (isRetiredWorkspaceStatus(agency.status)) continue;
    const settings =
      agency.settings && typeof agency.settings === "object" ? agency.settings : {};
    const leadId = (settings as Record<string, unknown>)["signup_lead_id"];
    out.push({
      tenantId: row.tenant_id,
      slug: agency.slug,
      displayName: agency.display_name?.trim() || agency.slug,
      signupTierInterest: normalizeWorkspaceTierInterest(
        (settings as Record<string, unknown>)["signup_tier_interest"],
      ),
      signupLeadId: typeof leadId === "string" && leadId.trim() ? leadId.trim() : null,
    });
  }

  return out;
}

/** Convenience wrapper: the first Free workspace this user owns, if any. */
export async function findOwnedFreeWorkspaceForUser(
  userId: string,
): Promise<OwnedFreeWorkspace | null> {
  const owned = await listOwnedFreeWorkspaces(userId);
  return owned[0] ?? null;
}
