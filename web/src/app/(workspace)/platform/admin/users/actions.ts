"use server";

/**
 * Platform-admin user management server actions.
 *
 * These run with the service-role client and are gated on super_admin.
 * Currently covers:
 *  - Email confirmation (useful for localhost QA and prod support).
 *  - Tier-1 safe actions: resend confirmation, password reset, force sign-out,
 *    support mode, claim invite.
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

/**
 * Force-confirm a user's email address.
 *
 * Useful on localhost (email delivery disabled) and for prod support cases
 * where a user never received the confirmation link. The service-role client
 * has access to `auth.admin.updateUserById`.
 */
export async function confirmPlatformUserEmail(
  userId: string,
): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;

  if (!userId?.trim()) return { ok: false, error: "Missing user ID." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Service role client not available." };

  const { error } = await admin.auth.admin.updateUserById(userId, {
    email_confirm: true,
  });

  if (error) {
    logServerError("platform/confirmUserEmail", error);
    return { ok: false, error: error.message ?? "Failed to confirm email." };
  }

  await logPlatformAdminAction({
    actorUserId: auth.userId,
    targetKind: "profile",
    targetId: userId,
    action: "email_confirmed_by_admin",
  });

  revalidatePath("/platform/admin/users");
  return { ok: true };
}

export type UserActivitySnapshot = {
  inquiryCount: number;
  bookingCount: number;
  lastFiveInquiries: Array<{
    id: string;
    title: string | null;
    status: string | null;
    createdAt: string;
    workspaceName: string | null;
  }>;
};

/**
 * Get activity snapshot for a platform user: inquiry/booking counts and recent inquiries.
 *
 * For `human`: queries inquiries where client_user_id matches the user.
 * For `unclaimed_talent`: returns empty (unclaimed talent profiles don't appear as inquiry clients).
 *
 * Returns null only on auth failure; returns zero snapshot on DB errors.
 */
export async function getPlatformUserActivity(
  targetId: string,
  targetKind: "human" | "unclaimed_talent",
): Promise<UserActivitySnapshot | null> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return null;

  if (!targetId?.trim()) return { inquiryCount: 0, bookingCount: 0, lastFiveInquiries: [] };

  // Unclaimed talent profiles don't create inquiries as clients.
  if (targetKind === "unclaimed_talent") {
    return { inquiryCount: 0, bookingCount: 0, lastFiveInquiries: [] };
  }

  const admin = createServiceRoleClient();
  if (!admin) return { inquiryCount: 0, bookingCount: 0, lastFiveInquiries: [] };

  try {
    // Fetch inquiry count and last 5 inquiries for this client
    const { data: inquiries, error: inquiryError } = await admin
      .from("inquiries")
      .select(
        "id, contact_name, status, created_at, tenant_id",
        { count: "exact" },
      )
      .eq("client_user_id", targetId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (inquiryError) {
      logServerError("platform/getPlatformUserActivity.inquiries", inquiryError);
      return { inquiryCount: 0, bookingCount: 0, lastFiveInquiries: [] };
    }

    const inquiryCount = inquiries?.length ?? 0;

    // Fetch booking count
    let bookingCount = 0;
    if (inquiryCount > 0 && inquiries) {
      const inquiryIds = inquiries.map((i) => i.id);
      const { count, error: bookingCountError } = await admin
        .from("agency_bookings")
        .select("id", { count: "exact", head: true })
        .in("inquiry_id", inquiryIds);

      if (bookingCountError) {
        logServerError("platform/getPlatformUserActivity.bookings", bookingCountError);
      } else {
        bookingCount = count ?? 0;
      }
    }

    // Fetch workspace names for the inquiries
    const workspaceLookup: Record<string, string> = {};
    if (inquiryCount > 0 && inquiries) {
      const tenantIds = [...new Set(inquiries.map((i) => i.tenant_id).filter(Boolean))];
      if (tenantIds.length > 0) {
        const { data: tenants, error: tenantError } = await admin
          .from("tenants")
          .select("id, display_name")
          .in("id", tenantIds);

        if (!tenantError && tenants) {
          tenants.forEach((t: { id: string; display_name: string }) => {
            workspaceLookup[t.id] = t.display_name;
          });
        }
      }
    }

    const lastFiveInquiries = (inquiries ?? []).map((inq: { id: string; contact_name: string; status: string; created_at: string; tenant_id: string }) => ({
      id: inq.id,
      title: inq.contact_name || null,
      status: inq.status,
      createdAt: inq.created_at,
      workspaceName: inq.tenant_id ? (workspaceLookup[inq.tenant_id] ?? null) : null,
    }));

    return {
      inquiryCount,
      bookingCount,
      lastFiveInquiries,
    };
  } catch (err) {
    logServerError("platform/getPlatformUserActivity", err);
    return { inquiryCount: 0, bookingCount: 0, lastFiveInquiries: [] };
  }
}

// ---------------------------------------------------------------------------
// Tier-1 safe admin actions
// ---------------------------------------------------------------------------

/**
 * Resend a confirmation (magic-link) email to a user.
 *
 * Fetches the user's email from Supabase auth, then generates a magic-link so
 * they can sign in and land on a confirmed session. This is the safest approach
 * because `generateLink` works regardless of confirmation state.
 */
export async function resendPlatformUserConfirmation(
  userId: string,
): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;

  if (!userId?.trim()) return { ok: false, error: "Missing user ID." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Service role client not available." };

  // Fetch user email first
  const { data: userData, error: getUserError } =
    await admin.auth.admin.getUserById(userId);
  if (getUserError || !userData?.user?.email) {
    logServerError("platform/resendConfirmation.getUser", getUserError ?? new Error("No email"));
    return { ok: false, error: getUserError?.message ?? "Could not fetch user email." };
  }

  const { error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: userData.user.email,
  });

  if (error) {
    logServerError("platform/resendConfirmation.generateLink", error);
    return { ok: false, error: error.message ?? "Failed to generate confirmation link." };
  }

  await logPlatformAdminAction({
    actorUserId: auth.userId,
    targetKind: "profile",
    targetId: userId,
    action: "confirmation_resent",
  });

  revalidatePath("/platform/admin/users");
  return { ok: true };
}

/**
 * Trigger a password-reset email for the given user.
 */
export async function sendPlatformUserPasswordReset(
  userId: string,
): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;

  if (!userId?.trim()) return { ok: false, error: "Missing user ID." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Service role client not available." };

  const { data: userData, error: getUserError } =
    await admin.auth.admin.getUserById(userId);
  if (getUserError || !userData?.user?.email) {
    logServerError("platform/sendPasswordReset.getUser", getUserError ?? new Error("No email"));
    return { ok: false, error: getUserError?.message ?? "Could not fetch user email." };
  }

  const redirectTo = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password`
    : undefined;

  const { error } = await admin.auth.resetPasswordForEmail(
    userData.user.email,
    redirectTo ? { redirectTo } : undefined,
  );

  if (error) {
    logServerError("platform/sendPasswordReset.reset", error);
    return { ok: false, error: error.message ?? "Failed to send password reset." };
  }

  await logPlatformAdminAction({
    actorUserId: auth.userId,
    targetKind: "profile",
    targetId: userId,
    action: "pwd_reset_sent",
  });

  revalidatePath("/platform/admin/users");
  return { ok: true };
}

/**
 * Set a temporary password for a user.
 *
 * Requires typed-name confirmation in the UI before calling this action.
 * The new password is NOT logged — only the fact that it was changed.
 */
export async function setPlatformUserTempPassword(
  userId: string,
  newPassword: string,
): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;

  if (!userId?.trim()) return { ok: false, error: "Missing user ID." };
  if (!newPassword || newPassword.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Service role client not available." };

  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: newPassword,
  });

  if (error) {
    logServerError("platform/setTempPassword", error);
    return { ok: false, error: error.message ?? "Failed to set password." };
  }

  await logPlatformAdminAction({
    actorUserId: auth.userId,
    targetKind: "profile",
    targetId: userId,
    action: "pwd_set_by_admin",
    after: { passwordChanged: true },
  });

  revalidatePath("/platform/admin/users");
  return { ok: true };
}

/**
 * Invalidate all active sessions for a user (global sign-out).
 */
export async function forcePlatformUserSignOut(
  userId: string,
): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;

  if (!userId?.trim()) return { ok: false, error: "Missing user ID." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Service role client not available." };

  const { error } = await admin.auth.admin.signOut(userId, "global");

  if (error) {
    logServerError("platform/forceSignOut", error);
    return { ok: false, error: error.message ?? "Failed to sign out user." };
  }

  await logPlatformAdminAction({
    actorUserId: auth.userId,
    targetKind: "profile",
    targetId: userId,
    action: "sessions_invalidated",
  });

  revalidatePath("/platform/admin/users");
  return { ok: true };
}

type SupportModeResult = ActionResult & { redirectUrl?: string };

/**
 * Open support mode for a human user or unclaimed talent profile.
 *
 * For humans: logs the action and returns the users list page (no impersonation in MVP).
 * For unclaimed talents: looks up the talent's public slug and returns `/t/<slug>`.
 */
export async function openPlatformSupportMode(
  targetId: string,
  targetKind: "human" | "unclaimed_talent",
): Promise<SupportModeResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;

  if (!targetId?.trim()) return { ok: false, error: "Missing target ID." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Service role client not available." };

  let redirectUrl: string | undefined;

  if (targetKind === "unclaimed_talent") {
    const { data: talent, error: talentError } = await admin
      .from("talent_profiles")
      .select("slug")
      .eq("id", targetId)
      .single();

    if (talentError || !talent?.slug) {
      logServerError("platform/openSupportMode.getSlug", talentError ?? new Error("No slug"));
      return { ok: false, error: talentError?.message ?? "Could not find talent profile." };
    }

    redirectUrl = `/t/${talent.slug}`;
  } else {
    // human — no impersonation in MVP, just log and return a neutral URL
    redirectUrl = "/platform/admin/users";
  }

  await logPlatformAdminAction({
    actorUserId: auth.userId,
    targetKind: targetKind === "human" ? "profile" : "talent_profile",
    targetId,
    action: "support_mode_opened",
  });

  revalidatePath("/platform/admin/users");
  return { ok: true, redirectUrl };
}

/**
 * Send a claim invite email to the given address for an unclaimed talent profile.
 *
 * Uses Supabase `inviteUserByEmail` which sends an invitation email automatically
 * and attaches the `claim_talent_profile_id` to the new user's metadata.
 */
export async function sendPlatformClaimInvite(
  talentProfileId: string,
  email: string,
): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;

  if (!talentProfileId?.trim()) return { ok: false, error: "Missing talent profile ID." };
  if (!email?.includes("@")) return { ok: false, error: "Invalid email address." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Service role client not available." };

  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { claim_talent_profile_id: talentProfileId },
  });

  if (error) {
    logServerError("platform/sendClaimInvite", error);
    return { ok: false, error: error.message ?? "Failed to send claim invite." };
  }

  await logPlatformAdminAction({
    actorUserId: auth.userId,
    targetKind: "talent_profile",
    targetId: talentProfileId,
    action: "claim_invite_sent",
    context: { invitedEmail: email },
  });

  revalidatePath("/platform/admin/users");
  return { ok: true };
}
