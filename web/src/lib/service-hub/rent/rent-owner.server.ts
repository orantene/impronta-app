import "server-only";

import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";

/**
 * TUL-1376: rent is owner-only, enforced where the data is read AND where it is written
 * (the settings page and every owner action call this; a layout check alone is not enough).
 */
export async function ownerGuard() {
  // TUL-1708 audit: requireWorkspaceStaffAction() below uses the default guard capability
  // (agency.workspace.view, viewer-held), but that is not this function's real gate. Every caller
  // relies on the explicit `role !== "owner"` check a few lines down, read straight from
  // agency_memberships — the strictest tier there is, stronger than any capability a non-owner could
  // hold. A viewer, editor, manager, or admin is refused here regardless of what capability the
  // staff check used. Not vulnerable; left on the default on purpose.
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false as const, reason: "unauthenticated" as const };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false as const, reason: "unavailable" as const };
  const { data } = await tenantScopedQuery(auth.supabase, "agency_memberships", auth.tenantId)
    .select("role")
    .eq("profile_id", auth.user.id)
    .eq("status", "active")
    .maybeSingle();
  if ((data as { role?: string } | null)?.role !== "owner") return { ok: false as const, reason: "owner_only" as const };
  return { ok: true as const, tenantId: auth.tenantId, userId: auth.user.id, admin };
}

