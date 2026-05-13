/**
 * Hybrid identity — talent ⇄ workspace mode resolver.
 *
 * Messages Consolidation Plan v2 — Slice L.
 *
 * Defines the data model for a user who is BOTH:
 *   - a talent (has a talent_profiles row), AND
 *   - a workspace member (has an agency_memberships row)
 *
 * The same human switches between "I'm working a job" (talent mode)
 * and "I'm running the workspace" (admin/coord mode). Per plan §7,
 * the talent-coord case is the first concrete hybrid implementation:
 * a talent who is also a coordinator on a specific inquiry.
 *
 * This module supplies:
 *   - resolveActorIdentity(supabase, userId) → typed structure
 *     describing the user's talent + workspace links
 *   - canSwitchToTalentMode / canSwitchToWorkspaceMode helpers
 *   - preferredSurfaceFor(identity) → "talent" | "workspace" | null
 *     (uses user_prefs.preferred_surface when set, else defaults
 *     based on which side the user mostly operates on)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";

export type HybridIdentity = {
  userId: string;
  /** Talent role — owner of a talent_profiles row. */
  talent: {
    profileId: string;
    displayName: string | null;
    // Stripe Connect status — feeds Offer-tab inline prompt (Slice K)
    stripeStatus: "none" | "pending" | "enabled" | "restricted" | "disabled";
  } | null;
  /** Workspace memberships — every tenant the user has a role in. */
  workspaces: Array<{
    tenantId: string;
    tenantSlug: string;
    tenantName: string;
    role: "owner" | "admin" | "coordinator" | "editor" | "viewer";
    status: "active" | "pending_acceptance" | "removed";
  }>;
};

export type HybridMode = "talent" | "workspace" | null;

/**
 * Load the user's hybrid identity. Returns null when the user is
 * neither a talent nor a workspace member (e.g. pure client account).
 */
export async function resolveActorIdentity(
  supabase: SupabaseClient,
  userId: string,
): Promise<HybridIdentity | null> {
  // 1. Talent side.
  const { data: tp } = await supabase
    .from("talent_profiles")
    .select("id, display_name, stripe_account_status")
    .eq("user_id", userId)
    .maybeSingle();

  // 2. Workspace memberships side.
  const { data: memberships, error: memErr } = await supabase
    .from("agency_memberships")
    .select(`
      tenant_id, role, status,
      agencies:tenant_id ( slug, display_name )
    `)
    .eq("profile_id", userId)
    .in("status", ["active", "pending_acceptance"]);
  if (memErr) {
    logServerError("hybrid-mode.resolve.memberships", memErr);
  }

  type MembershipRow = {
    tenant_id: string;
    role: string;
    status: string;
    agencies: { slug: string | null; display_name: string | null }
      | { slug: string | null; display_name: string | null }[]
      | null;
  };

  const workspaces = ((memberships ?? []) as MembershipRow[])
    .filter((m) => m.agencies !== null)
    .map((m) => {
      const ag = Array.isArray(m.agencies) ? m.agencies[0] : m.agencies;
      return {
        tenantId: m.tenant_id,
        tenantSlug: ag?.slug ?? "",
        tenantName: ag?.display_name ?? "Workspace",
        role: (m.role as HybridIdentity["workspaces"][number]["role"]) ?? "viewer",
        status: (m.status as HybridIdentity["workspaces"][number]["status"]) ?? "active",
      };
    });

  if (!tp && workspaces.length === 0) {
    // Not a hybrid (neither talent nor workspace member). Caller
    // resolves them as pure client / pure-anything-else elsewhere.
    return null;
  }

  return {
    userId,
    talent: tp ? {
      profileId: tp.id as string,
      displayName: (tp.display_name as string | null) ?? null,
      stripeStatus: ((tp.stripe_account_status as HybridIdentity["talent"] extends infer T
        ? T extends { stripeStatus: infer S } ? S : never : never) ?? "none") as
          HybridIdentity["talent"] extends infer T ? T extends { stripeStatus: infer S } ? S : never : never,
    } : null,
    workspaces,
  };
}

/** Can this user enter Talent mode? True when they own a talent_profile. */
export function canSwitchToTalentMode(identity: HybridIdentity | null): boolean {
  return !!identity?.talent;
}

/** Can this user enter Workspace mode? True when they're an active
 *  member of at least one workspace. */
export function canSwitchToWorkspaceMode(identity: HybridIdentity | null): boolean {
  return !!identity && identity.workspaces.some((w) => w.status === "active");
}

/** Is this user a hybrid? True when they can switch both directions. */
export function isHybridIdentity(identity: HybridIdentity | null): boolean {
  return canSwitchToTalentMode(identity) && canSwitchToWorkspaceMode(identity);
}

/**
 * Default surface choice when the user has not explicitly pinned one
 * via user_prefs.preferred_surface. Heuristic: workspace owners +
 * admins default to workspace; pure-talent defaults to talent;
 * anything else defaults to talent (less-disruptive for hybrid
 * coord-talents who mostly do talent work and occasionally coord).
 */
export function defaultPreferredSurface(identity: HybridIdentity | null): HybridMode {
  if (!identity) return null;
  if (canSwitchToWorkspaceMode(identity)) {
    const hasOwnerOrAdmin = identity.workspaces.some(
      (w) => w.status === "active" && (w.role === "owner" || w.role === "admin"),
    );
    if (hasOwnerOrAdmin) return "workspace";
  }
  if (canSwitchToTalentMode(identity)) return "talent";
  if (canSwitchToWorkspaceMode(identity)) return "workspace";
  return null;
}

/**
 * Per plan §7, an "inquiry coordinator" is anyone admitted to the
 * Client thread on that inquiry. A talent-coord is the hybrid case
 * where the same person is BOTH a talent line item AND a coordinator
 * on the same inquiry — they earn both lanes (talent payout +
 * workspace fee share, see Slice H helpers).
 */
export function isTalentCoordOnInquiry(
  identity: HybridIdentity | null,
  /** Participants on this inquiry, role-resolved. */
  participantsOnInquiry: Array<{ userId: string; role: string }>,
): boolean {
  if (!identity?.talent) return false;
  const me = participantsOnInquiry.filter((p) => p.userId === identity.userId);
  if (me.length === 0) return false;
  const isTalentRow = me.some((p) => p.role === "talent");
  const isCoordRow = me.some((p) => p.role === "coordinator");
  return isTalentRow && isCoordRow;
}
