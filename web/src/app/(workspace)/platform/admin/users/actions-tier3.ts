"use server";

/**
 * Platform-admin Tier-3 destructive actions.
 *
 * These are the most sensitive operator actions in the platform. Every one
 * requires a typed-name confirmation that the server re-validates against the
 * target's stored display name (the modal enforces it client-side, but never
 * trust the client). Audit rows are written BEFORE the destructive op so the
 * trail survives even when the row is gone afterwards. See plan §7 / §10.
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

function namesMatch(typed: string, actual: string | null | undefined): boolean {
  if (!actual) return false;
  return typed.trim().toLowerCase() === actual.trim().toLowerCase();
}

// ─── Tier-3 destructive actions ───────────────────────────────────────────────

/**
 * Permanently delete a platform user account.
 *
 * Wipes the `profiles` row (cascades to talent via FK) and then deletes the
 * `auth.users` row. Irreversible — typed-name confirmation required.
 */
export async function deletePlatformUserAccount(
  userId: string,
  confirmName: string,
): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;

  if (!userId?.trim()) return { ok: false, error: "Missing user ID." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Service role client not available." };

  const { data: profile, error: fetchError } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();

  if (fetchError) {
    logServerError("platform/deletePlatformUserAccount.fetch", fetchError);
    return { ok: false, error: fetchError.message ?? "Failed to load profile." };
  }
  if (!profile) return { ok: false, error: "Profile not found." };

  const displayName = profile.display_name as string | null;
  if (!namesMatch(confirmName, displayName)) {
    return { ok: false, error: "Confirmation name does not match." };
  }

  // Audit FIRST — the profile row is about to be gone.
  await logPlatformAdminAction({
    actorUserId: auth.userId,
    targetKind: "profile",
    targetId: userId,
    action: "account_deleted",
    before: { displayName },
    after: undefined,
  });

  const { error: profileDeleteError } = await admin
    .from("profiles")
    .delete()
    .eq("id", userId);

  if (profileDeleteError) {
    logServerError("platform/deletePlatformUserAccount.profile", profileDeleteError);
    return {
      ok: false,
      error: profileDeleteError.message ?? "Failed to delete profile.",
    };
  }

  const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);
  if (authDeleteError) {
    logServerError("platform/deletePlatformUserAccount.auth", authDeleteError);
    return {
      ok: false,
      error: authDeleteError.message ?? "Failed to delete auth user.",
    };
  }

  revalidatePath("/platform/admin/users");
  return { ok: true };
}

/**
 * GDPR-anonymize a platform user in place.
 *
 * Scrubs PII (display_name + auth email + linked talent profile display_name)
 * but leaves the account functional. Typed-name confirmation required.
 *
 * Integrator decision: cascade to messages / inquiries with cached display
 * names is deferred — see TODO below.
 */
export async function gdprAnonymizePlatformUser(
  userId: string,
  confirmName: string,
): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;

  if (!userId?.trim()) return { ok: false, error: "Missing user ID." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Service role client not available." };

  const { data: profile, error: fetchError } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();

  if (fetchError) {
    logServerError("platform/gdprAnonymizePlatformUser.fetch", fetchError);
    return { ok: false, error: fetchError.message ?? "Failed to load profile." };
  }
  if (!profile) return { ok: false, error: "Profile not found." };

  const displayName = profile.display_name as string | null;
  if (!namesMatch(confirmName, displayName)) {
    return { ok: false, error: "Confirmation name does not match." };
  }

  const anonSuffix = userId.replace(/-/g, "").slice(0, 8);
  const anonEmail = `anon_${anonSuffix}@anonymized.tulala.digital`;

  // Audit FIRST so the before-state survives even if a downstream step fails.
  await logPlatformAdminAction({
    actorUserId: auth.userId,
    targetKind: "profile",
    targetId: userId,
    action: "account_anonymized",
    before: { displayName },
    after: { anonymized: true },
  });

  const { error: profileUpdateError } = await admin
    .from("profiles")
    .update({ display_name: "Anonymized User" })
    .eq("id", userId);

  if (profileUpdateError) {
    logServerError(
      "platform/gdprAnonymizePlatformUser.profile",
      profileUpdateError,
    );
    return {
      ok: false,
      error: profileUpdateError.message ?? "Failed to anonymize profile.",
    };
  }

  // Talent-profile scrub is best-effort — not every user has one.
  const { error: talentUpdateError } = await admin
    .from("talent_profiles")
    .update({ display_name: "Anonymized User" })
    .eq("user_id", userId);

  if (talentUpdateError) {
    logServerError(
      "platform/gdprAnonymizePlatformUser.talent",
      talentUpdateError,
    );
    // Continue — talent profile may not exist.
  }

  const { error: authUpdateError } = await admin.auth.admin.updateUserById(
    userId,
    { email: anonEmail, email_confirm: true },
  );

  if (authUpdateError) {
    logServerError("platform/gdprAnonymizePlatformUser.auth", authUpdateError);
    return {
      ok: false,
      error: authUpdateError.message ?? "Failed to anonymize auth user.",
    };
  }

  // TODO: cascade anonymization to messages, inquiries where display_name is cached

  revalidatePath("/platform/admin/users");
  return { ok: true };
}

/**
 * Unclaim a talent profile — sever its link to the claiming auth user.
 *
 * Does NOT delete the auth user. The talent profile is also un-published
 * globally so it stays hidden until it's re-claimed. Typed-name confirmation
 * matches against `talent_profiles.display_name`.
 */
export async function unclaimTalentProfile(
  talentProfileId: string,
  confirmName: string,
): Promise<ActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;

  if (!talentProfileId?.trim()) {
    return { ok: false, error: "Missing talent profile ID." };
  }

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Service role client not available." };

  const { data: talent, error: fetchError } = await admin
    .from("talent_profiles")
    .select("display_name, user_id")
    .eq("id", talentProfileId)
    .maybeSingle();

  if (fetchError) {
    logServerError("platform/unclaimTalentProfile.fetch", fetchError);
    return {
      ok: false,
      error: fetchError.message ?? "Failed to load talent profile.",
    };
  }
  if (!talent) return { ok: false, error: "Talent profile not found." };

  const displayName = talent.display_name as string | null;
  const previousUserId = (talent.user_id as string | null) ?? null;

  if (!namesMatch(confirmName, displayName)) {
    return { ok: false, error: "Confirmation name does not match." };
  }

  await logPlatformAdminAction({
    actorUserId: auth.userId,
    targetKind: "talent_profile",
    targetId: talentProfileId,
    action: "talent_unclaimed",
    before: { userId: previousUserId },
    after: { userId: null },
  });

  const { error: updateError } = await admin
    .from("talent_profiles")
    .update({ user_id: null, published_globally: false })
    .eq("id", talentProfileId);

  if (updateError) {
    logServerError("platform/unclaimTalentProfile.update", updateError);
    return {
      ok: false,
      error: updateError.message ?? "Failed to unclaim talent profile.",
    };
  }

  revalidatePath("/platform/admin/users");
  return { ok: true };
}
