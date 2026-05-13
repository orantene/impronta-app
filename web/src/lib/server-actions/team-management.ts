"use server";

import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { revalidatePath } from "next/cache";
import type { ServerActionResult } from "./result";

/**
 * F.1 — Team management server actions.
 *
 * Three entry points the Team drawer wires:
 *
 *   1. inviteTeamMember(email, role) — email path. Creates a row in
 *      team_invite_tokens that the redeem flow will later turn into an
 *      agency_memberships row. Email delivery itself is Phase 8 (Resend /
 *      Loops); for now we return the redeem URL so the admin can copy it.
 *
 *   2. promoteRosterTalentToAdmin(talentProfileId, role) — existing-user
 *      path. The talent is on the agency_talent_roster already so they
 *      have a profile. We create an agency_memberships row directly with
 *      status='active' (no email round-trip needed — they're already
 *      verified by the roster claim).
 *
 *   3. setDefaultCoordinator(profileId | null) — workspace owner picks
 *      which admin is the auto-coordinator for new inquiries. Owner-only.
 *
 *   4. removeTeamMember(profileId) — sets membership.status='removed'.
 *      Cannot remove the only active owner.
 *
 * All actions are tenant-scoped via requireStaffTenantAction.
 */

type Role = "admin" | "coordinator" | "editor" | "viewer";

const VALID_ROLES = new Set<Role>(["admin", "coordinator", "editor", "viewer"]);

// ─── 1. Email invite ──────────────────────────────────────────────────────

export type InviteTeamMemberResult = ServerActionResult<{
  inviteId: string;
  /** App-host URL the operator can share until email delivery is wired. */
  redeemUrl: string;
  /** When the link expires (ISO). */
  expiresAt: string;
}>;

export async function inviteTeamMember(
  email: string,
  role: Role,
): Promise<InviteTeamMemberResult> {
  try {
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: "Not authenticated.", reason: "unauthenticated" };
    const { tenantId, user } = auth;

    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return { ok: false, error: "Enter a valid email address.", reason: "validation_failed" };
    }
    if (!VALID_ROLES.has(role)) {
      return { ok: false, error: "Invalid role.", reason: "validation_failed" };
    }

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Service unavailable.", reason: "unexpected" };

    // Check if this email already has an active membership in this tenant.
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id")
      .ilike("email", trimmed)
      .maybeSingle();
    if (existingProfile) {
      const { data: existingMembership } = await admin
        .from("agency_memberships")
        .select("status, role")
        .eq("tenant_id", tenantId)
        .eq("profile_id", (existingProfile as { id: string }).id)
        .in("status", ["active", "invited", "pending_acceptance"])
        .maybeSingle();
      if (existingMembership) {
        return {
          ok: false,
          error: `That person is already on this workspace as ${(existingMembership as { role: string }).role}.`,
          reason: "already_exists",
        };
      }
    }

    // Revoke any previous pending invite to this email for this tenant.
    await admin
      .from("team_invite_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .ilike("invited_email", trimmed)
      .is("redeemed_at", null)
      .is("revoked_at", null);

    const { data: token, error: insertErr } = await admin
      .from("team_invite_tokens")
      .insert({
        tenant_id: tenantId,
        invited_email: trimmed,
        target_role: role,
        invited_by_user_id: user.id,
      })
      .select("id, expires_at")
      .single();

    if (insertErr || !token) {
      logServerError("team-management.inviteTeamMember.insert", insertErr);
      return { ok: false, error: "Couldn't create invite. Try again.", reason: "unexpected" };
    }

    const inviteId = (token as { id: string; expires_at: string }).id;
    const expiresAt = (token as { id: string; expires_at: string }).expires_at;
    const redeemUrl = `/team-invite/${inviteId}`;

    // Fire-and-forget email delivery — no-op when RESEND_API_KEY is unset
    // so the admin-side flow still works in dev / preview. Failures are
    // logged in sendEmail; we still return ok so the admin sees the URL.
    void (async () => {
      try {
        const [{ sendEmail }, { teamInviteEmail }, { data: agencyRow }, { data: inviterProfile }] = await Promise.all([
          import("@/lib/email"),
          import("@/lib/email/templates"),
          admin.from("agencies").select("display_name, slug").eq("id", tenantId).maybeSingle(),
          admin.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
        ]);
        const agencyName = (agencyRow as { display_name?: string | null } | null)?.display_name?.trim() || "the workspace";
        const inviterName = (inviterProfile as { display_name?: string | null } | null)?.display_name?.trim() || "A teammate";
        const tenantSlug = (agencyRow as { slug?: string | null } | null)?.slug ?? "";
        const { subject, html } = teamInviteEmail({
          inviterName,
          agencyName,
          role,
          redeemUrl,
          expiresAtIso: expiresAt,
          brand: tenantSlug
            ? { wordmark: agencyName.toUpperCase(), accountName: agencyName }
            : undefined,
        });
        await sendEmail({ to: trimmed, subject, html });
      } catch (err) {
        // Never let email failure break the action — the admin still has the URL.
        console.warn("[team-management.inviteTeamMember] email send failed", err);
      }
    })();

    revalidatePath("/", "layout");
    return { ok: true, data: { inviteId, redeemUrl, expiresAt } };
  } catch (err) {
    logServerError("team-management.inviteTeamMember", err);
    return { ok: false, error: "Unexpected error.", reason: "unexpected" };
  }
}

// ─── 2. Promote roster talent to admin ────────────────────────────────────

export async function promoteRosterTalentToAdmin(
  talentProfileId: string,
  role: Role,
): Promise<ServerActionResult<{ membershipId: string }>> {
  try {
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: "Not authenticated.", reason: "unauthenticated" };
    const { tenantId } = auth;

    if (!VALID_ROLES.has(role)) {
      return { ok: false, error: "Invalid role.", reason: "validation_failed" };
    }

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Service unavailable.", reason: "unexpected" };

    // Resolve talent_profile → user_id → profile_id. The roster talent
    // must have a claimed account for us to grant admin to.
    const { data: talent } = await admin
      .from("talent_profiles")
      .select("user_id, display_name, first_name")
      .eq("id", talentProfileId)
      .maybeSingle();
    const userId = (talent as { user_id?: string | null } | null)?.user_id ?? null;
    if (!userId) {
      return {
        ok: false,
        error: "This talent hasn't claimed their account yet — send them a claim invite first.",
        reason: "not_found",
      };
    }

    // Confirm they're on this tenant's roster (status active).
    const { data: roster } = await admin
      .from("agency_talent_roster")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("talent_profile_id", talentProfileId)
      .eq("status", "active")
      .maybeSingle();
    if (!roster) {
      return {
        ok: false,
        error: "Talent isn't on this workspace's active roster.",
        reason: "forbidden",
      };
    }

    // Check for an existing membership row.
    const { data: existing } = await admin
      .from("agency_memberships")
      .select("id, status")
      .eq("tenant_id", tenantId)
      .eq("profile_id", userId)
      .in("status", ["active", "invited", "pending_acceptance", "suspended"])
      .maybeSingle();

    if (existing) {
      // Already a member — just update role.
      const { error: updateErr } = await admin
        .from("agency_memberships")
        .update({ role, status: "active" })
        .eq("id", (existing as { id: string }).id);
      if (updateErr) {
        logServerError("team-management.promoteRosterTalentToAdmin.update", updateErr);
        return { ok: false, error: "Couldn't update role.", reason: "unexpected" };
      }
      revalidatePath("/", "layout");
      return { ok: true, data: { membershipId: (existing as { id: string }).id } };
    }

    const { data: newMembership, error: insertErr } = await admin
      .from("agency_memberships")
      .insert({
        tenant_id: tenantId,
        profile_id: userId,
        role,
        status: "active",
        accepted_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertErr || !newMembership) {
      logServerError("team-management.promoteRosterTalentToAdmin.insert", insertErr);
      return { ok: false, error: "Couldn't add to team.", reason: "unexpected" };
    }

    revalidatePath("/", "layout");
    return { ok: true, data: { membershipId: (newMembership as { id: string }).id } };
  } catch (err) {
    logServerError("team-management.promoteRosterTalentToAdmin", err);
    return { ok: false, error: "Unexpected error.", reason: "unexpected" };
  }
}

// ─── 3. Default coordinator ───────────────────────────────────────────────

export async function setDefaultCoordinator(
  userId: string | null,
): Promise<ServerActionResult> {
  try {
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: "Not authenticated.", reason: "unauthenticated" };
    const { tenantId, user, supabase } = auth;

    // Owner-only — workspace settings live with the owner.
    const { data: myMembership } = await supabase
      .from("agency_memberships")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("profile_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    const myRole = (myMembership as { role?: string } | null)?.role;
    if (myRole !== "owner" && myRole !== "admin") {
      return { ok: false, error: "Only the workspace owner or admin can change this.", reason: "forbidden" };
    }

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Service unavailable.", reason: "unexpected" };

    const { error: updateErr } = await admin
      .from("agencies")
      .update({ default_coordinator_user_id: userId })
      .eq("id", tenantId);

    if (updateErr) {
      // The trigger raises P0001 when the user isn't an active member.
      const msg = updateErr.message?.toLowerCase() ?? "";
      if (msg.includes("must be an active member")) {
        return {
          ok: false,
          error: "That person isn't an active member of this workspace.",
          reason: "validation_failed",
        };
      }
      logServerError("team-management.setDefaultCoordinator.update", updateErr);
      return { ok: false, error: "Couldn't update setting.", reason: "unexpected" };
    }

    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (err) {
    logServerError("team-management.setDefaultCoordinator", err);
    return { ok: false, error: "Unexpected error.", reason: "unexpected" };
  }
}

// ─── 4. Remove team member ────────────────────────────────────────────────

export async function removeTeamMember(profileId: string): Promise<ServerActionResult> {
  try {
    const auth = await requireStaffTenantAction();
    if (!auth.ok) return { ok: false, error: "Not authenticated.", reason: "unauthenticated" };
    const { tenantId, user } = auth;

    if (profileId === user.id) {
      return { ok: false, error: "You can't remove yourself.", reason: "forbidden" };
    }

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Service unavailable.", reason: "unexpected" };

    // Cannot remove the only active owner.
    const { data: target } = await admin
      .from("agency_memberships")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("profile_id", profileId)
      .eq("status", "active")
      .maybeSingle();
    if ((target as { role?: string } | null)?.role === "owner") {
      return { ok: false, error: "You can't remove the workspace owner.", reason: "forbidden" };
    }

    const { error: updateErr } = await admin
      .from("agency_memberships")
      .update({ status: "removed", removed_at: new Date().toISOString(), removed_by: user.id })
      .eq("tenant_id", tenantId)
      .eq("profile_id", profileId);

    if (updateErr) {
      logServerError("team-management.removeTeamMember.update", updateErr);
      return { ok: false, error: "Couldn't remove member.", reason: "unexpected" };
    }

    // Clear default coordinator if it pointed to the removed user.
    await admin
      .from("agencies")
      .update({ default_coordinator_user_id: null })
      .eq("id", tenantId)
      .eq("default_coordinator_user_id", profileId);

    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (err) {
    logServerError("team-management.removeTeamMember", err);
    return { ok: false, error: "Unexpected error.", reason: "unexpected" };
  }
}
