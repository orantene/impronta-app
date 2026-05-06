"use server";

/**
 * Platform-admin user management server actions.
 *
 * These run with the service-role client and are gated on super_admin.
 * Currently covers:
 *  - Email confirmation (useful for localhost QA and prod support).
 */

import { revalidatePath } from "next/cache";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { getPlatformRole } from "@/lib/access/platform-role";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

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

  revalidatePath("/platform/admin/users");
  return { ok: true };
}
