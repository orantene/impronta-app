"use server";

/**
 * "How you work with people" for a workspace's hub (TUL-1442). It sets client prices, the
 * split and who gets requests, so it is OWNER or ADMIN only (an active membership is
 * checked, a staff login alone is not enough). The choice is validated before anything is
 * written, and a style that is already set is never replaced without `confirmed: true`.
 */

import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { canSetWorkStyle, isWorkStyleChoice } from "@/lib/service-hub/work-style";
import { saveWorkStyle, type SaveWorkStyle } from "@/lib/service-hub/work-style.server";

export type SaveWorkStyleActionResult = SaveWorkStyle | { ok: false; reason: "invalid" | "not_allowed" };

export async function saveWorkStyleAction(input: unknown): Promise<SaveWorkStyleActionResult> {
  await requireNotImpersonating();
  const raw = input as { choice?: unknown; confirmed?: unknown } | null;
  if (!isWorkStyleChoice(raw?.choice)) return { ok: false, reason: "invalid" };
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false, reason: "unavailable" };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "unavailable" };
  const { data, error } = await tenantScopedQuery(admin, "agency_memberships", guard.tenantId)
    .select("role")
    .eq("profile_id", guard.user.id)
    .eq("status", "active")
    .maybeSingle();
  if (error) {
    logServerError("service-hub.workStyle.role", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!canSetWorkStyle((data as { role?: string } | null)?.role)) return { ok: false, reason: "not_allowed" };
  return saveWorkStyle(admin, { tenantId: guard.tenantId, userId: guard.user.id, choice: raw.choice, confirmed: raw?.confirmed === true });
}
