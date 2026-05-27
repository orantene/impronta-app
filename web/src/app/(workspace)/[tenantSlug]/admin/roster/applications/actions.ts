"use server";

/**
 * Server actions for the Roster · Applications page.
 *
 * toggleOpenApplications — flips agencies.accepts_open_applications on/off.
 * Only owners and admins can change this (manage_talent_roster capability).
 */

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { logServerError } from "@/lib/server/safe-error";

export type ToggleOpenApplicationsResult =
  | { ok: true; acceptsApplications: boolean }
  | { ok: false; error: string };

export async function toggleOpenApplications(
  tenantSlug: string,
  nextValue: boolean,
): Promise<ToggleOpenApplicationsResult> {
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) return { ok: false, error: "Workspace not found." };

  const canManage = await userHasCapability("manage_talent_roster", scope.tenantId);
  if (!canManage) return { ok: false, error: "You don't have permission to change this setting." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Service unavailable." };

  const { error } = await admin
    .from("agencies")
    .update({ accepts_open_applications: nextValue })
    .eq("id", scope.tenantId);

  if (error) {
    logServerError("applications/toggleOpenApplications", error);
    return { ok: false, error: error.message };
  }

  revalidatePath(`/${tenantSlug}/admin/roster/applications`);
  return { ok: true, acceptsApplications: nextValue };
}
