"use server";

/**
 * Platform-admin Tier-2 reversible actions.
 *
 * These run with the service-role client and are gated on super_admin.
 * All actions are reversible (suspend/unsuspend, hide/unhide, flag/unflag).
 * Every write is logged to platform_audit_log via logPlatformAdminAction.
 */

import { revalidatePath } from "next/cache";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { getPlatformRole } from "@/lib/access/platform-role";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { logPlatformAdminAction } from "@/lib/platform/audit";

type ActionResult = { ok: true } | { ok: false; error: string };

async function requirePlatformAdmin(): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string }
> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not authenticated." };
  const role = getPlatformRole(session.profile);
  if (role !== "super_admin") return { ok: false, error: "Forbidden." };
  return { ok: true, userId: session.user.id };
}

const NOW = () => new Date().toISOString();

// ─── Tier-2 reversible admin actions ─────────────────────────────────────────

/**
 * Suspend a platform user: ban in Supabase Auth (10-year duration = effectively
 * permanent until unsuspended) and set profiles.account_status = 'suspended'.
 */
export async function suspendPlatformUser(
  userId: string,
): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;

  if (!userId?.trim()) return { ok: false, error: "Missing user ID." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Service role client not available." };

  const { error: banError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: "87600h",
  });
  if (banError) {
    logServerError("platform/suspendUser.ban", banError);
    return { ok: false, error: banError.message ?? "Failed to suspend user." };
  }

  const { error: dbError } = await admin
    .from("profiles")
    .update({ account_status: "suspended", updated_at: NOW() })
    .eq("id", userId);
  if (dbError) {
    logServerError("platform/suspendUser.profile", dbError);
    // Best-effort: unban auth so the two states don't diverge
    await admin.auth.admin.updateUserById(userId, { ban_duration: "none" });
    return { ok: false, error: "Failed to update profile status." };
  }

  await logPlatformAdminAction({
    actorUserId: auth.userId,
    targetKind: "profile",
    targetId: userId,
    action: "account_suspended",
    before: { accountStatus: "active" },
    after: { accountStatus: "suspended" },
  });

  revalidatePath("/platform/admin/users");
  return { ok: true };
}

/**
 * Unsuspend a platform user: remove the Auth ban and restore
 * profiles.account_status = 'active'.
 */
export async function unsuspendPlatformUser(
  userId: string,
): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;

  if (!userId?.trim()) return { ok: false, error: "Missing user ID." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Service role client not available." };

  const { error: unbanError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: "none",
  });
  if (unbanError) {
    logServerError("platform/unsuspendUser.unban", unbanError);
    return { ok: false, error: unbanError.message ?? "Failed to unsuspend user." };
  }

  const { error: dbError } = await admin
    .from("profiles")
    .update({ account_status: "active", updated_at: NOW() })
    .eq("id", userId);
  if (dbError) {
    logServerError("platform/unsuspendUser.profile", dbError);
    return { ok: false, error: "Failed to restore profile status." };
  }

  await logPlatformAdminAction({
    actorUserId: auth.userId,
    targetKind: "profile",
    targetId: userId,
    action: "account_unsuspended",
    before: { accountStatus: "suspended" },
    after: { accountStatus: "active" },
  });

  revalidatePath("/platform/admin/users");
  return { ok: true };
}

/**
 * Show or hide a talent profile platform-wide by toggling
 * talent_profiles.published_globally.
 */
export async function hideTalentGlobally(
  talentProfileId: string,
  hidden: boolean,
): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;

  if (!talentProfileId?.trim()) return { ok: false, error: "Missing talent profile ID." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Service role client not available." };

  const { error } = await admin
    .from("talent_profiles")
    .update({
      published_globally: !hidden,
      hidden_at: hidden ? NOW() : null,
      hidden_by_user_id: hidden ? auth.userId : null,
    })
    .eq("id", talentProfileId);

  if (error) {
    logServerError("platform/hideTalentGlobally", error);
    return { ok: false, error: error.message ?? "Failed to update talent visibility." };
  }

  await logPlatformAdminAction({
    actorUserId: auth.userId,
    targetKind: "talent_profile",
    targetId: talentProfileId,
    action: hidden ? "talent_hidden_globally" : "talent_unhidden_globally",
    after: { publishedGlobally: !hidden },
  });

  revalidatePath("/platform/admin/users");
  return { ok: true };
}

/**
 * Show or hide a talent profile on a specific tenant site by managing a row
 * in user_visibility_overrides. Hiding upserts a row; unhiding deletes it.
 */
export async function hideTalentOnSite(
  talentProfileId: string,
  tenantId: string,
  hidden: boolean,
): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;

  if (!talentProfileId?.trim()) return { ok: false, error: "Missing talent profile ID." };
  if (!tenantId?.trim()) return { ok: false, error: "Missing tenant ID." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Service role client not available." };

  if (hidden) {
    const { error } = await admin
      .from("user_visibility_overrides")
      .upsert(
        {
          target_kind: "talent_profile",
          target_id: talentProfileId,
          tenant_id: tenantId,
          hidden_by_user_id: auth.userId,
          hidden_at: NOW(),
        },
        { onConflict: "target_id,tenant_id" },
      );
    if (error) {
      logServerError("platform/hideTalentOnSite.upsert", error);
      return { ok: false, error: error.message ?? "Failed to hide talent on site." };
    }
  } else {
    const { error } = await admin
      .from("user_visibility_overrides")
      .delete()
      .eq("target_id", talentProfileId)
      .eq("tenant_id", tenantId);
    if (error) {
      logServerError("platform/hideTalentOnSite.delete", error);
      return { ok: false, error: error.message ?? "Failed to restore talent visibility on site." };
    }
  }

  await logPlatformAdminAction({
    actorUserId: auth.userId,
    targetKind: "talent_profile",
    targetId: talentProfileId,
    action: hidden ? "talent_hidden_on_site" : "talent_unhidden_on_site",
    context: { tenantId, hidden },
  });

  revalidatePath("/platform/admin/users");
  return { ok: true };
}

/**
 * Toggle the is_test_account flag on a profile or unclaimed talent profile.
 * Test accounts are excluded from analytics counts.
 */
export async function markPlatformUserAsTest(
  targetId: string,
  targetKind: "human" | "unclaimed_talent",
  isTest: boolean,
): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;

  if (!targetId?.trim()) return { ok: false, error: "Missing target ID." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Service role client not available." };

  if (targetKind === "human") {
    const { error } = await admin
      .from("profiles")
      .update({ is_test_account: isTest, updated_at: NOW() })
      .eq("id", targetId);
    if (error) {
      logServerError("platform/markAsTest.profile", error);
      return { ok: false, error: error.message ?? "Failed to update test flag." };
    }
  } else {
    const { error } = await admin
      .from("talent_profiles")
      .update({ is_test_account: isTest })
      .eq("id", targetId);
    if (error) {
      logServerError("platform/markAsTest.talentProfile", error);
      return { ok: false, error: error.message ?? "Failed to update test flag." };
    }
  }

  await logPlatformAdminAction({
    actorUserId: auth.userId,
    targetKind: targetKind === "human" ? "profile" : "talent_profile",
    targetId,
    action: isTest ? "marked_test" : "marked_not_test",
    after: { isTestAccount: isTest },
  });

  revalidatePath("/platform/admin/users");
  return { ok: true };
}

/**
 * Remove a user from a specific workspace by setting their membership
 * status to 'removed'.
 */
export async function removeUserFromWorkspace(
  profileId: string,
  tenantId: string,
): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;

  if (!profileId?.trim()) return { ok: false, error: "Missing profile ID." };
  if (!tenantId?.trim()) return { ok: false, error: "Missing tenant ID." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Service role client not available." };

  const { error } = await admin
    .from("agency_memberships")
    .update({
      status: "removed",
      removed_at: NOW(),
      removed_by: auth.userId,
      updated_at: NOW(),
    })
    .eq("profile_id", profileId)
    .eq("tenant_id", tenantId)
    .eq("status", "active");

  if (error) {
    logServerError("platform/removeFromWorkspace", error);
    return { ok: false, error: error.message ?? "Failed to remove user from workspace." };
  }

  await logPlatformAdminAction({
    actorUserId: auth.userId,
    targetKind: "membership",
    targetId: profileId,
    action: "removed_from_workspace",
    context: { tenantId },
  });

  revalidatePath("/platform/admin/users");
  return { ok: true };
}

const VALID_WORKSPACE_ROLES = [
  "viewer",
  "editor",
  "manager",
  "admin",
  "owner",
] as const;
type WorkspaceRole = (typeof VALID_WORKSPACE_ROLES)[number];

/**
 * Change a user's role in a specific workspace.
 * Valid roles: viewer, editor, manager, admin, owner.
 */
export async function changePlatformUserWorkspaceRole(
  profileId: string,
  tenantId: string,
  newRole: string,
): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;

  if (!profileId?.trim()) return { ok: false, error: "Missing profile ID." };
  if (!tenantId?.trim()) return { ok: false, error: "Missing tenant ID." };
  if (!(VALID_WORKSPACE_ROLES as readonly string[]).includes(newRole)) {
    return {
      ok: false,
      error: `Invalid role. Must be one of: ${VALID_WORKSPACE_ROLES.join(", ")}.`,
    };
  }
  const role = newRole as WorkspaceRole;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Service role client not available." };

  const { error } = await admin
    .from("agency_memberships")
    .update({ role, updated_at: NOW() })
    .eq("profile_id", profileId)
    .eq("tenant_id", tenantId)
    .eq("status", "active");

  if (error) {
    logServerError("platform/changeWorkspaceRole", error);
    return { ok: false, error: error.message ?? "Failed to change workspace role." };
  }

  await logPlatformAdminAction({
    actorUserId: auth.userId,
    targetKind: "membership",
    targetId: profileId,
    action: "workspace_role_changed",
    context: { tenantId, newRole: role },
  });

  revalidatePath("/platform/admin/users");
  return { ok: true };
}
