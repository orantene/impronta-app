"use server";

/**
 * "How you work with people" for a workspace's hub (TUL-1442). Workspace staff only; the
 * choice is validated against the five known values before anything is written.
 */

import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { isWorkStyleChoice } from "@/lib/service-hub/work-style";
import { saveWorkStyle, type SaveWorkStyle } from "@/lib/service-hub/work-style.server";

export async function saveWorkStyleAction(input: unknown): Promise<SaveWorkStyle | { ok: false; reason: "invalid" }> {
  await requireNotImpersonating();
  const choice = (input as { choice?: unknown } | null)?.choice;
  if (!isWorkStyleChoice(choice)) return { ok: false, reason: "invalid" };
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false, reason: "unavailable" };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "unavailable" };
  return saveWorkStyle(admin, { tenantId: guard.tenantId, userId: guard.user.id, choice });
}
